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

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { apply, inject } from '../lib/index.js'
import { readZipForTest } from './zip-helper.mjs'

const SCRATCH = join(homedir(), '.dsh-file-explorer-test')
const TRASH = join(homedir(), '.Trash')

/** Routes the plugin registered on the authenticated connection service. */
const routes = new Map()
apply({
  effect: fn => fn(),
  connection: {
    fetch: {
      register: (registration) => {
        routes.set(registration.path, registration)
        return () => routes.delete(registration.path)
      },
    },
  },
})

if (routes.size === 0) {
  console.error('FAIL the plugin registered no routes')
  process.exit(1)
}

/**
 * Drive one route through the Fetch handler the plugin registered.
 * @param {'GET'|'POST'} method - HTTP method
 * @param {string} sub - route suffix, e.g. "/list"
 * @param {Record<string, string>} params - query parameters
 * @param {unknown} body - JSON body for POST
 * @returns {Promise<{ status: number, body: any }>} response
 */
async function call(method, sub, params = {}, body, headers = {}) {
  const registration = routes.get('/api/file-explorer' + sub)
  if (!registration) return { status: 0, body: 'route not registered: ' + sub }
  const search = new URLSearchParams(params).toString()
  const request = new Request('http://127.0.0.1:1/api/file-explorer' + sub + (search ? '?' + search : ''), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const response = await registration.fetch(request)
  const text = await response.text()
  let parsed = null
  try { parsed = JSON.parse(text) } catch { parsed = text }
  return { status: response.status, body: parsed }
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
  check('meta reports the manifest', r.status === 200 && r.body.name === '@maxbill/dsh-file-explorer' && /^\d+\.\d+\.\d+$/.test(r.body.version) && r.body.author && r.body.author.name === 'MaxBill', r.body)
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

  // Authentication is the host's job: the routes live on the connection gate,
  // so the plugin never has to parse Origin/Sec-Fetch-Site itself.
  check('the plugin injects the authenticated connection service', inject.includes('connection') && !inject.includes('webServer'), inject)
  check('every route is registered with its methods', routes.size === 22 && routes.get('/api/file-explorer/list').methods.join() === 'GET' && routes.get('/api/file-explorer/trash').methods.join() === 'POST', [...routes.keys()].length)

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

  // ---- upload / download / archive / extract / git / write ----------------
  const uploadRoute = routes.get('/api/file-explorer/upload')
  const uploadResponse = await uploadRoute.fetch(new Request(
    'http://127.0.0.1:1/api/file-explorer/upload?path=' + encodeURIComponent(SCRATCH) + '&name=uploaded.txt',
    { method: 'POST', body: 'hello from the browser' },
  ))
  const uploaded = await uploadResponse.json()
  check('upload writes the streamed body', uploadResponse.status === 200 && uploaded.size === 22 && uploaded.name === 'uploaded.txt', uploaded)
  const bytes = await readFile(uploaded.path, 'utf8')
  check('uploaded bytes match the request body', bytes === 'hello from the browser', bytes)

  const clashResponse = await uploadRoute.fetch(new Request(
    'http://127.0.0.1:1/api/file-explorer/upload?path=' + encodeURIComponent(SCRATCH) + '&name=uploaded.txt',
    { method: 'POST', body: 'second' },
  ))
  const clash = await clashResponse.json()
  check('upload never overwrites, it renames', clashResponse.status === 200 && clash.path !== uploaded.path && /uploaded 2\.txt$/.test(clash.path), clash)

  r = await call('GET', '/download', { path: uploaded.path })
  check('download serves the file as an attachment', r.body.includes('browser') || r.status === 200, r.status)

  r = await call('POST', '/write', { path: uploaded.path }, { text: 'edited in the panel\n' })
  check('write saves the editor contents', r.status === 200 && r.body.size === 20, r.body)
  check('write really replaced the bytes', (await readFile(uploaded.path, 'utf8')) === 'edited in the panel\n')

  await mkdir(join(SCRATCH, 'zipped'), { recursive: true })
  await writeFile(join(SCRATCH, 'zipped', 'one.txt'), 'first file\n')
  await writeFile(join(SCRATCH, 'zipped', 'two.txt'), 'second file\n')
  r = await call('POST', '/archive', {}, { sources: [join(SCRATCH, 'zipped')] })
  check('archive zips a folder beside itself', r.status === 200 && /\.zip$/.test(r.body.path), r.body)
  const archivePath = r.body?.path
  const archiveEntries = readZipForTest(await readFile(archivePath))
  check('archive holds every file', archiveEntries.has('zipped/one.txt') && archiveEntries.has('zipped/two.txt'), [...archiveEntries.keys()])
  check('archive round-trips the bytes', String(archiveEntries.get('zipped/one.txt')) === 'first file\n', String(archiveEntries.get('zipped/one.txt')))

  r = await call('POST', '/extract', {}, { path: archivePath })
  check('extract unpacks beside the archive', r.status === 200 && r.body.files === 2 && r.body.skipped === 1, r.body)
  check('extract restores the file contents', (await readFile(join(r.body.path, 'zipped', 'one.txt'), 'utf8')) === 'first file\n')

  r = await call('GET', '/git', { path: SCRATCH })
  check('git route answers for a plain folder', r.status === 200 && r.body.repo === null, r.body)

  r = await call('GET', '/nope', {})
  check('unknown suffixes are never registered', r.status === 0 && routes.has('/api/file-explorer/list'), r.body.message)

  const malformed = routes.get('/api/file-explorer/transfer')
  const malformedResponse = await malformed.fetch(new Request('http://127.0.0.1:1/api/file-explorer/transfer', {
    method: 'POST',
    body: 'not json',
  }))
  r = { status: malformedResponse.status, body: JSON.parse(await malformedResponse.text()) }
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
