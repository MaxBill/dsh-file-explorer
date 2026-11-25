/**
 * Host API regression test for dsh-file-explorer.
 *
 * Runs the plugin's host half without DSH: it stubs cordis' ctx and the web
 * server's route registration, then drives every route with a fake HTTP
 * request/response pair.
 *
 * Every path the plugin serves is confined to the home directory, so the test
 * works inside a scratch folder under $HOME and moves one file into ~/.Trash.
 * Everything it creates is removed afterwards, including the trashed file.
 *
 * Run with: npm test
 */

import { Readable } from 'node:stream'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { apply } from '../lib/index.js'

const SCRATCH = join(homedir(), '.dsh-file-explorer-test')
const TRASH = join(homedir(), '.Trash')

let route
apply({
  effect: fn => { fn() },
  webServer: { register: (candidate) => { route = candidate; return () => {} } },
})

if (typeof route?.handler !== 'function') {
  console.error('FAIL the plugin did not register an HTTP handler')
  process.exit(1)
}

/**
 * Drive one route with a synthetic request.
 * @param {'GET'|'POST'} method - HTTP method
 * @param {string} sub - route suffix, e.g. "/list"
 * @param {Record<string, string>} params - query parameters
 * @param {unknown} body - JSON body for POST
 * @returns {Promise<{ status: number, body: any }>} response
 */
function call(method, sub, params = {}, body) {
  return new Promise((resolve, reject) => {
    const search = new URLSearchParams(params).toString()
    const payload = body === undefined ? '' : JSON.stringify(body)
    const req = Readable.from(payload.length > 0 ? [Buffer.from(payload)] : [])
    req.method = method
    req.url = route.path + sub + (search ? '?' + search : '')
    req.headers = {}
    let status = 0
    const res = {
      writeHead(code) { status = code },
      end(chunk) {
        const text = chunk === undefined ? '' : String(chunk)
        let parsed = null
        try { parsed = JSON.parse(text) } catch { parsed = text }
        resolve({ status, body: parsed })
      },
    }
    Promise.resolve(route.handler(req, res)).catch(reject)
  })
}

const results = []
const check = (label, condition, detail) => {
  results.push({ label, ok: Boolean(condition), detail })
}

let exitCode = 0
try {
  await rm(SCRATCH, { recursive: true, force: true })
  await mkdir(join(SCRATCH, 'a'), { recursive: true })
  await mkdir(join(SCRATCH, 'b'), { recursive: true })
  await writeFile(join(SCRATCH, 'seed.txt'), 'seed')

  let r = await call('GET', '/list', { path: SCRATCH })
  check('lists a directory', r.status === 200 && r.body.entries.length === 3, r.body.entries?.map(e => e.name))
  r = await call('GET', '/read', { path: join(SCRATCH, 'seed.txt') })
  check('reads a text file', r.status === 200 && r.body.kind === 'text' && r.body.text === 'seed')
  r = await call('GET', '/meta')
  check('meta reports the manifest', r.status === 200 && r.body.name === 'dsh-file-explorer' && /^\d+\.\d+\.\d+$/.test(r.body.version) && r.body.author && r.body.author.name === 'MaxBill', r.body)
  r = await call('GET', '/stat', { path: join(SCRATCH, 'seed.txt') })
  check('details for a file', r.status === 200 && r.body.dir === false && r.body.name === 'seed.txt' && typeof r.body.mode === 'string', r.body)
  r = await call('GET', '/stat', { path: join(SCRATCH, 'a') })
  check('details for a folder', r.status === 200 && r.body.dir === true && r.body.items === 0, r.body)

  r = await call('GET', '/raw', { path: join(SCRATCH, 'seed.txt') })
  check('raw streams the file bytes', r.status === 200 && String(r.body) === 'seed', String(r.body))
  r = await call('GET', '/raw', { path: join(SCRATCH, 'a') })
  check('raw refuses a folder', r.status === 400, r.body)
  r = await call('GET', '/sheet', { path: join(SCRATCH, 'seed.txt') })
  check('sheet refuses a file that is not a workbook', r.status === 415, r.body)
  r = await call('GET', '/document', { path: join(SCRATCH, 'seed.txt') })
  check('document refuses a file that is not a Word document', r.status === 415, r.body)

  r = await call('POST', '/newfile', { path: join(SCRATCH, 'a'), name: 'one.txt' })
  check('creates a file', r.status === 200, r.body)
  r = await call('POST', '/newfile', { path: join(SCRATCH, 'a'), name: 'two.txt' })
  check('creates a second file', r.status === 200)
  r = await call('POST', '/mkdir', { path: SCRATCH, name: '新项目' })
  check('creates a folder with a non-ASCII name', r.status === 200, r.body)

  // One file per icon kind, so the listing classifier stays honest.
  const kinds = { 'doc.docx': 'word', 'sheet.xlsx': 'excel', 'slides.pptx': 'ppt', 'pack.zip': 'archive', 'song.mp3': 'audio', 'clip.mp4': 'video', 'file.pdf': 'pdf', 'shot.png': 'image', 'note.txt': 'text', 'app.dmg': 'archive', 'source.ts': 'text' }
  for (const name of Object.keys(kinds)) await writeFile(join(SCRATCH, name), 'x')
  r = await call('GET', '/list', { path: SCRATCH })
  const found = Object.fromEntries((r.body.entries || []).map(e => [e.name, e.kind]))
  const wrong = Object.entries(kinds).filter(([name, kind]) => found[name] !== kind)
  check('classifies the icon kinds', wrong.length === 0, { wrong, found })

  r = await call('POST', '/rename', { path: join(SCRATCH, 'a', 'two.txt'), name: 'one.txt' })
  check('refuses to overwrite on rename (409)', r.status === 409, r.body.message)
  r = await call('POST', '/rename', { path: join(SCRATCH, 'a', 'one.txt'), name: 'renamed.txt' })
  check('renames a file', r.status === 200 && r.body.path.endsWith('renamed.txt'), r.body)
  r = await call('POST', '/rename', { path: join(SCRATCH, 'a'), name: 'bad/name' })
  check('rejects a name containing a separator (400)', r.status === 400, r.body.message)

  r = await call('POST', '/duplicate', { path: join(SCRATCH, 'a', 'renamed.txt') })
  const copy = r.body?.path
  check('duplicates beside itself', r.status === 200 && String(copy).includes('副本'), r.body)
  r = await call('POST', '/duplicate', { path: join(SCRATCH, 'a', 'renamed.txt') })
  check('a second duplicate gets a unique name', r.status === 200 && r.body.path !== copy, r.body)

  r = await call('POST', '/transfer', {}, { sources: [join(SCRATCH, 'a', 'renamed.txt')], target: join(SCRATCH, 'b'), mode: 'copy' })
  check('copies into another folder', r.status === 200 && r.body.results[0].path === join(SCRATCH, 'b', 'renamed.txt'), r.body)
  check('transfer reports the source for undo', r.body.results[0].from === join(SCRATCH, 'a', 'renamed.txt'), r.body.results[0])
  r = await call('POST', '/transfer', {}, { sources: [join(SCRATCH, 'b', 'renamed.txt')], target: join(SCRATCH, 'a'), mode: 'move' })
  check('a move that clashes auto-renames', r.status === 200 && r.body.results[0].path !== join(SCRATCH, 'a', 'renamed.txt'), r.body)
  r = await call('POST', '/transfer', {}, { sources: [join(SCRATCH, 'a')], target: join(SCRATCH, 'a'), mode: 'move' })
  check('refuses to move a folder into itself (400)', r.status === 400, r.body.message)
  r = await call('POST', '/transfer', {}, { sources: [], target: SCRATCH, mode: 'copy' })
  check('refuses an empty transfer (400)', r.status === 400)

  r = await call('POST', '/trash', { path: join(SCRATCH, 'a', 'renamed 副本.txt') })
  check('moves an item into the Trash', r.status === 200 && String(r.body.path).includes('.Trash'), r.body)
  check('trash reports the source for undo', r.body.from === join(SCRATCH, 'a', 'renamed 副本.txt'), r.body.from)

  r = await call('POST', '/mkdir', { path: '/etc', name: 'nope' })
  check('refuses writes outside the root (403)', r.status === 403, r.body.message)
  r = await call('POST', '/rename', { path: homedir(), name: 'x' })
  check('refuses to rename the root (403)', r.status === 403)
  r = await call('GET', '/nope', {})
  check('unknown routes answer 404', r.status === 404)

  r = await new Promise((resolve) => {
    const req = Readable.from([Buffer.from('not json')])
    req.method = 'POST'
    req.url = route.path + '/transfer'
    req.headers = {}
    const res = {
      writeHead(code) { this.code = code },
      end(chunk) { resolve({ status: this.code, body: JSON.parse(String(chunk)) }) },
    }
    route.handler(req, res)
  })
  check('malformed JSON answers 400', r.status === 400, r.body.message)
} catch (error) {
  check('test run completed without throwing', false, String(error?.stack ?? error))
} finally {
  for (const { label, ok, detail } of results) {
    console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail === undefined || ok ? '' : '  ' + JSON.stringify(detail)))
  }
  exitCode = results.some(item => !item.ok) ? 1 : 0
  console.log('\n' + (results.length - results.filter(item => item.ok).length) + ' failed / ' + results.length + ' checks')

  await rm(SCRATCH, { recursive: true, force: true })
  for (const name of await readdir(TRASH).catch(() => [])) {
    if (/renamed|dsh-file-explorer-test/.test(name)) await rm(join(TRASH, name), { recursive: true, force: true })
  }
}
process.exit(exitCode)
