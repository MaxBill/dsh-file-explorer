/**
 * dsh-file-explorer — host half.
 *
 * Serves a small file API on the DSH web server for the 文件管理器 panel:
 * browse, preview, and the common write actions behind the panel's context
 * menu (rename, duplicate, copy/move, new folder, new file, move to Trash).
 *
 * Every path is confined to the user's home directory: requests are resolved
 * through realpath() first, so neither ".." segments nor symbolic links can
 * escape the root. Write routes never overwrite an existing item.
 *
 * Routes (prefix /api/file-explorer):
 *   GET  /meta                        plugin name, version, author
 *   GET  /roots                       allowed browsing roots
 *   GET  /list?path=                  directory listing
 *   GET  /read?path=                  text / image / binary preview
 *   POST /reveal?path=                reveal in the OS file manager
 *   POST /open?path=                  open with the default application
 *   POST /rename?path=&name=          rename an item
 *   POST /duplicate?path=             copy an item beside itself
 *   POST /mkdir?path=&name=           create a directory inside path
 *   POST /newfile?path=&name=         create an empty file inside path
 *   POST /trash?path=                 move an item into ~/.Trash
 *   POST /transfer                    JSON {sources, target, mode: copy|move}
 */

import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { access, cp, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { deflateRawSync, inflateRawSync } from 'node:zlib'

/** Services this plugin waits for. */
export const inject = ['connection']

/** Route prefix; the client half fetches <prefix>/... . */
const PREFIX = '/api/file-explorer'

/** Browsing root: the user's home directory. */
const ROOT = homedir()

/** Largest file the preview route will read, in bytes. */
const MAX_TEXT_BYTES = 512 * 1024
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** Largest workbook we will parse for the preview. */
const MAX_SHEET_BYTES = 32 * 1024 * 1024

/** Most rows and columns a sheet preview returns. */
const MAX_SHEET_ROWS = 500
const MAX_SHEET_COLS = 60

/** Directory listings are capped so one huge folder cannot stall the panel. */
const MAX_ENTRIES = 2000

/** Extensions rendered as text even when they are unusual. */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'mdx', 'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'mts', 'cts', 'vue', 'svelte', 'css', 'scss', 'less', 'html', 'htm',
  'xml', 'svg', 'csv', 'tsv', 'log', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'py', 'rb', 'go', 'rs', 'java',
  'kt', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'lua', 'pl', 'r', 'sql', 'graphql', 'gql', 'diff',
  'patch', 'gitignore', 'npmrc', 'editorconfig', 'lock', 'properties', 'gradle', 'dockerfile', 'makefile',
])

/** Extensions rendered as images. */
const IMAGE_MIME = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.bmp', 'image/bmp'],
  ['.ico', 'image/x-icon'],
  ['.avif', 'image/avif'],
  ['.svg', 'image/svg+xml'],
])

/** Extensions grouped for the listing icons; anything else falls back to a plain file. */
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.aac', '.flac', '.m4a', '.ogg', '.oga', '.opus', '.aiff', '.aif', '.wma', '.mid', '.midi', '.amr', '.ape'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.mpg', '.mpeg', '.3gp', '.m2ts', '.mts', '.ogv'])
const WORD_EXTENSIONS = new Set(['.doc', '.docx', '.dot', '.dotx', '.rtf', '.wps'])
const EXCEL_EXTENSIONS = new Set(['.xls', '.xlsx', '.xlsm', '.xlsb', '.et'])
const PPT_EXTENSIONS = new Set(['.ppt', '.pptx', '.pps', '.ppsx', '.dps'])
const ARCHIVE_EXTENSIONS = new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.tbz', '.xz', '.txz', '.zst', '.lz', '.lzma', '.dmg', '.iso', '.cab', '.jar', '.war'])

/** Error carrying the HTTP status the route should answer with. */
class RouteError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/**
 * Whether a resolved absolute path stays inside the browsing root.
 * @param {string} target - absolute, already-real path
 * @returns {boolean} true when inside
 */
function insideRoot(target) {
  return target === ROOT || target.startsWith(ROOT + sep)
}

/**
 * Expand "~", then resolve a request path to a real absolute path inside ROOT.
 * @param {string | null | undefined} input - path from the query string or body
 * @returns {Promise<string>} canonical absolute path
 */
async function safePath(input) {
  const raw = typeof input === 'string' && input.trim().length > 0 ? input.trim() : ROOT
  const expanded = raw === '~' ? ROOT : raw.startsWith('~/') ? join(ROOT, raw.slice(2)) : raw
  const absolute = resolve(expanded)
  if (!insideRoot(absolute)) throw new RouteError(403, 'path is outside the allowed root')
  let real
  try {
    real = await realpath(absolute)
  } catch {
    throw new RouteError(404, 'path does not exist')
  }
  if (!insideRoot(real)) throw new RouteError(403, 'path is outside the allowed root')
  return real
}

/**
 * Validate a single path segment supplied by the client.
 * @param {unknown} name - proposed entry name
 * @returns {string} the trimmed name
 */
function safeName(name) {
  if (typeof name !== 'string') throw new RouteError(400, 'name is required')
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new RouteError(400, 'name is empty')
  if (trimmed === '.' || trimmed === '..') throw new RouteError(400, 'invalid name')
  if (trimmed.length > 255) throw new RouteError(400, 'name is too long')
  if (/[\\/\u0000]/.test(trimmed)) throw new RouteError(400, 'name cannot contain a path separator')
  return trimmed
}

/**
 * Whether a path exists.
 * @param {string} target - absolute path
 * @returns {Promise<boolean>} true when present
 */
async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

/**
 * Pick a path beside `name` that does not exist yet.
 * @param {string} dir - destination directory
 * @param {string} name - preferred file name
 * @returns {Promise<string>} absolute free path
 */
async function freePath(dir, name) {
  const first = join(dir, name)
  if (!(await exists(first))) return first
  const extension = extname(name)
  const stem = extension.length > 0 ? name.slice(0, -extension.length) : name
  for (let index = 2; index < 1000; index += 1) {
    const candidate = join(dir, stem + ' ' + index + extension)
    if (!(await exists(candidate))) return candidate
  }
  throw new RouteError(409, 'too many items with that name')
}

/**
 * "name.ext" -> "name 副本.ext"
 * @param {string} name - source entry name
 * @returns {string} duplicate name
 */
function duplicateName(name) {
  const extension = extname(name)
  const stem = extension.length > 0 ? name.slice(0, -extension.length) : name
  return stem + ' 副本' + extension
}

/**
 * Stable kind classification for the file icon and the preview route.
 * @param {string} name - entry basename
 * @param {boolean} isDir - directory flag
 * @returns {string} kind word
 */
function kindOf(name, isDir) {
  if (isDir) return 'folder'
  const ext = extname(name).toLowerCase()
  if (IMAGE_MIME.has(ext)) return 'image'
  // Text is matched before media so a .ts source file is not read as a transport stream.
  if (TEXT_EXTENSIONS.has(ext.slice(1)) || TEXT_EXTENSIONS.has(name.toLowerCase())) return 'text'
  if (ext === '.pdf') return 'pdf'
  if (WORD_EXTENSIONS.has(ext)) return 'word'
  if (EXCEL_EXTENSIONS.has(ext)) return 'excel'
  if (PPT_EXTENSIONS.has(ext)) return 'ppt'
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  return 'binary'
}

/**
 * Follow a symbolic link to decide whether it points at a directory.
 * @param {string} target - absolute link path
 * @returns {Promise<boolean>} true for a directory target
 */
async function isDirectoryTarget(target) {
  try {
    return (await stat(target)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Read a directory into the wire shape the client renders.
 * @param {string} dir - canonical directory path
 * @returns {Promise<object>} listing payload
 */
async function listDirectory(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    throw new RouteError(error && error.code === 'EACCES' ? 403 : 500, String(error && error.message))
  }
  const visible = entries.slice(0, MAX_ENTRIES)
  const rows = await Promise.all(visible.map(async (entry) => {
    const full = join(dir, entry.name)
    const isDir = entry.isDirectory() || (entry.isSymbolicLink() && await isDirectoryTarget(full))
    let size = 0
    let mtime = 0
    try {
      const info = await stat(full)
      size = info.size
      mtime = info.mtimeMs
    } catch {
      // A dangling link or a permission-denied entry still lists, without stats.
    }
    return {
      name: entry.name,
      path: full,
      dir: isDir,
      link: entry.isSymbolicLink(),
      hidden: entry.name.startsWith('.'),
      size,
      mtime,
      kind: kindOf(entry.name, isDir),
    }
  }))
  const parent = dir === ROOT ? null : dirname(dir)
  return {
    root: ROOT,
    path: dir,
    name: basename(dir),
    parent: parent && insideRoot(parent) ? parent : null,
    truncated: entries.length > visible.length,
    entries: rows,
  }
}

/**
 * Answer the metadata route: the plugin's own manifest, for the About dialog.
 * @returns {Promise<object>} name, version, description, author, links
 */
async function readMeta() {
  const file = new URL('../package.json', import.meta.url)
  const raw = await readFile(file, 'utf8')
  const pkg = JSON.parse(raw)
  let build = null
  try {
    const info = await stat(file)
    const stamp = new Date(info.mtimeMs)
    build = String(stamp.getFullYear()) +
      String(stamp.getMonth() + 1).padStart(2, '0') +
      String(stamp.getDate()).padStart(2, '0')
  } catch {
    build = null
  }
  return {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    author: pkg.author,
    homepage: pkg.homepage,
    repository: pkg.repository,
    license: pkg.license,
    build,
    root: ROOT,
  }
}

/**
 * Render POSIX permission bits the way ls does.
 * @param {number} mode - st_mode from stat()
 * @returns {string} e.g. "-rw-r--r--"
 */
function modeString(mode) {
  const type = mode & 0o170000
  const lead = type === 0o040000 ? 'd' : type === 0o120000 ? 'l' : type === 0o010000 ? 'p' : type === 0o140000 ? 's' : '-'
  const bits = ['r', 'w', 'x']
  let out = lead
  for (let shift = 6; shift >= 0; shift -= 3) {
    for (let bit = 0; bit < 3; bit += 1) {
      out += (mode >> (shift + (2 - bit))) & 1 ? bits[bit] : '-'
    }
  }
  return out
}

/**
 * Answer the details route: everything the info pane shows about one entry.
 * @param {string} target - canonical path
 * @returns {Promise<object>} details payload
 */
async function statEntry(target) {
  const info = await stat(target)
  const linkInfo = await lstat(target)
  const isDir = info.isDirectory()
  const entry = {
    path: target,
    name: basename(target),
    parent: dirname(target),
    dir: isDir,
    link: linkInfo.isSymbolicLink(),
    kind: kindOf(basename(target), isDir),
    size: info.size,
    mtime: info.mtimeMs,
    birthtime: info.birthtimeMs || info.ctimeMs,
    mode: modeString(info.mode),
    modeOctal: '0o' + (info.mode & 0o7777).toString(8),
    items: null,
  }
  if (isDir) {
    try {
      entry.items = (await readdir(target)).length
    } catch {
      entry.items = null
    }
  }
  return entry
}

/**
 * Answer the preview route for one file.
 * @param {string} file - canonical file path
 * @returns {Promise<object>} preview payload
 */
async function readPreview(file) {
  const info = await stat(file)
  if (info.isDirectory()) throw new RouteError(400, 'path is a directory')
  const ext = extname(file).toLowerCase()
  const mime = IMAGE_MIME.get(ext)
  if (mime && info.size <= MAX_IMAGE_BYTES) {
    const data = await readFile(file)
    return {
      kind: 'image',
      mime,
      size: info.size,
      mtime: info.mtimeMs,
      dataUrl: 'data:' + mime + ';base64,' + data.toString('base64'),
    }
  }
  const base = { size: info.size, mtime: info.mtimeMs, mime: mime ?? null }
  if (info.size > MAX_TEXT_BYTES) {
    return { ...base, kind: 'too-large', limit: MAX_TEXT_BYTES }
  }
  const buffer = await readFile(file)
  if (buffer.includes(0)) {
    return { ...base, kind: 'binary' }
  }
  return { ...base, kind: 'text', text: buffer.toString('utf8'), truncated: false }
}

/**
 * Run a desktop helper, e.g. `open`.
 * @param {string} command - executable name
 * @param {string[]} args - arguments
 * @returns {Promise<void>} resolves when the helper exits 0
 */
function runHelper(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(command, args, (error) => {
      if (error) rejectPromise(new RouteError(500, String(error.message)))
      else resolvePromise(undefined)
    })
  })
}

/**
 * Reveal a path in the OS file manager.
 * @param {string} target - canonical absolute path
 * @returns {Promise<object>} outcome
 */
async function reveal(target) {
  if (platform() !== 'darwin') return { ok: false, reason: 'unsupported-platform' }
  await runHelper('open', ['-R', target])
  return { ok: true }
}

/**
 * Open a path with the desktop's default application.
 * @param {string} target - canonical absolute path
 * @returns {Promise<object>} outcome
 */
async function openWithDefault(target) {
  if (platform() === 'darwin') {
    await runHelper('open', [target])
    return { ok: true }
  }
  if (platform() === 'win32') {
    await runHelper('cmd', ['/c', 'start', '', target])
    return { ok: true }
  }
  await runHelper('xdg-open', [target])
  return { ok: true }
}

/**
 * Rename one entry in place.
 * @param {string} source - canonical path
 * @param {string} name - new entry name
 * @returns {Promise<object>} outcome
 */
async function renameEntry(source, name) {
  if (source === ROOT) throw new RouteError(403, 'cannot rename the browsing root')
  const clean = safeName(name)
  const parent = dirname(source)
  const target = join(parent, clean)
  if (target === source) return { ok: true, path: source }
  if (await exists(target)) throw new RouteError(409, '同名项已存在')
  await rename(source, target)
  return { ok: true, path: target }
}

/**
 * Copy one entry beside itself.
 * @param {string} source - canonical path
 * @returns {Promise<object>} outcome
 */
async function duplicateEntry(source) {
  if (source === ROOT) throw new RouteError(403, 'cannot duplicate the browsing root')
  const parent = dirname(source)
  const target = await freePath(parent, duplicateName(basename(source)))
  await cp(source, target, { recursive: true, errorOnExist: true, force: false })
  return { ok: true, path: target }
}

/**
 * Create a directory inside `parent`.
 * @param {string} parent - canonical directory path
 * @param {string} name - new directory name
 * @returns {Promise<object>} outcome
 */
async function createDirectory(parent, name) {
  const clean = safeName(name)
  const target = join(parent, clean)
  if (await exists(target)) throw new RouteError(409, '同名项已存在')
  await mkdir(target)
  return { ok: true, path: target }
}

/**
 * Create an empty file inside `parent`.
 * @param {string} parent - canonical directory path
 * @param {string} name - new file name
 * @returns {Promise<object>} outcome
 */
async function createFile(parent, name) {
  const clean = safeName(name)
  const target = join(parent, clean)
  if (await exists(target)) throw new RouteError(409, '同名项已存在')
  await writeFile(target, '', { flag: 'wx' })
  return { ok: true, path: target }
}

/**
 * Move one entry into ~/.Trash, never deleting it outright.
 * @param {string} source - canonical path
 * @returns {Promise<object>} outcome
 */
async function moveToTrash(source) {
  if (source === ROOT) throw new RouteError(403, 'cannot trash the browsing root')
  const trashDir = join(ROOT, '.Trash')
  await mkdir(trashDir, { recursive: true })
  const target = await freePath(trashDir, basename(source))
  await rename(source, target)
  return { ok: true, path: target, from: source }
}

/**
 * Copy or move several entries into one directory.
 * @param {object} body - { sources, target, mode }
 * @returns {Promise<object>} outcome
 */
async function transfer(body) {
  const mode = body.mode === 'move' ? 'move' : 'copy'
  const sources = Array.isArray(body.sources) ? body.sources : []
  if (sources.length === 0) throw new RouteError(400, '没有要处理的项目')
  const targetDir = await safePath(body.target)
  if (!(await stat(targetDir)).isDirectory()) throw new RouteError(400, '目标不是文件夹')
  const results = []
  for (const raw of sources) {
    const source = await safePath(raw)
    if (source === ROOT) throw new RouteError(403, 'cannot transfer the browsing root')
    if (targetDir === source || targetDir.startsWith(source + sep)) {
      throw new RouteError(400, '不能把文件夹移动到它自己里面')
    }
    if (dirname(source) === targetDir) {
      if (mode === 'move') {
        results.push({ path: source, from: source, skipped: '已在目标文件夹' })
        continue
      }
    }
    // Never overwrite: a name clash becomes "name 2", the way the panel's copy does.
    const target = await freePath(targetDir, basename(source))
    if (mode === 'move') {
      try {
        await rename(source, target)
      } catch (error) {
        if (!error || error.code !== 'EXDEV') throw error
        await cp(source, target, { recursive: true, errorOnExist: true, force: false })
        await rm(source, { recursive: true, force: true })
      }
    } else {
      await cp(source, target, { recursive: true, errorOnExist: true, force: false })
    }
    results.push({ path: target, from: source })
  }
  return { ok: true, mode, target: targetDir, results }
}

/**
 * Write one JSON response.
 * @param {import('node:http').ServerResponse} res - response
 * @param {number} status - HTTP status
 * @param {unknown} payload - serializable body
 */
function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/**
 * Read every entry out of a ZIP archive (stored or deflated).
 * @param {Buffer} buffer - whole archive
 * @returns {Map<string, Buffer>} entry name -> inflated bytes
 */
function readZip(buffer) {
  const entries = new Map()
  let eocd = -1
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 66_000; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new RouteError(415, 'not a zip archive')
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    offset += 46 + nameLength + extraLength + commentLength
    // offset 0 is a legitimate entry: an archive whose first member starts the file
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) continue
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    if (name.endsWith('/')) { entries.set(name, Buffer.alloc(0)); continue }
    const data = buffer.subarray(dataStart, dataStart + compressedSize)
    try {
      entries.set(name, method === 8 ? inflateRawSync(data) : data)
    } catch {
      // A corrupt entry is skipped rather than failing the whole workbook.
    }
  }
  return entries
}

/**
 * Pull the text out of one shared-string entry.
 * @param {string} xml - <si> block
 * @returns {string} joined text
 */
function sharedStringText(xml) {
  const parts = []
  const pattern = /<t[^>]*>([\s\S]*?)<\/t>/g
  let match = pattern.exec(xml)
  while (match) {
    parts.push(decodeXml(match[1]))
    match = pattern.exec(xml)
  }
  return parts.join('')
}

/**
 * Decode the five XML entities spreadsheets use.
 * @param {string} text - raw text
 * @returns {string} decoded text
 */
function decodeXml(text) {
  return String(text)
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (match, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Column letters to a zero-based index (A -> 0, AA -> 26).
 * @param {string} letters - cell column
 * @returns {number} index
 */
function columnIndex(letters) {
  let value = 0
  for (const ch of letters) value = value * 26 + (ch.charCodeAt(0) - 64)
  return value - 1
}

/**
 * Read one worksheet into rows of strings.
 * @param {string} xml - sheet XML
 * @param {string[]} shared - shared string table
 * @returns {Array<Array<string>>} rows
 */
function sheetRows(xml, shared) {
  const rows = []
  const rowPattern = /<row[^>]*>([\s\S]*?)<\/row>/g
  let rowMatch = rowPattern.exec(xml)
  while (rowMatch && rows.length < MAX_SHEET_ROWS) {
    const cells = []
    const cellPattern = /<c([^>]*)>([\s\S]*?)<\/c>/g
    let cellMatch = cellPattern.exec(rowMatch[1])
    while (cellMatch && cells.length < MAX_SHEET_COLS) {
      const attrs = cellMatch[1]
      const body = cellMatch[2]
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)
      const type = /t="([a-zA-Z]+)"/.exec(attrs)
      const index = ref ? columnIndex(ref[1]) : cells.length
      while (cells.length < index) cells.push('')
      let value = ''
      if (type && type[1] === 's') {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)
        value = raw ? (shared[Number(raw[1])] ?? '') : ''
      } else if (type && (type[1] === 'str' || type[1] === 'inlineStr')) {
        const raw = /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)
        value = raw ? decodeXml(raw[1]) : ''
      } else if (type && type[1] === 'b') {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)
        value = raw && raw[1] === '1' ? 'TRUE' : 'FALSE'
      } else if (type && type[1] === 'e') {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)
        value = raw ? decodeXml(raw[1]) : '#ERR'
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)
        value = raw ? raw[1] : ''
      }
      cells.push(value)
      cellMatch = cellPattern.exec(rowMatch[1])
    }
    rows.push(cells)
    rowMatch = rowPattern.exec(xml)
  }
  return rows
}

/**
 * Parse an .xlsx/.xlsm workbook into its sheets.
 * @param {Buffer} buffer - file bytes
 * @returns {{sheets: Array<{name: string, rows: Array<Array<string>>}>}} preview payload
 */
function readWorkbook(buffer) {
  const zip = readZip(buffer)
  const workbook = zip.get('xl/workbook.xml')
  const relationships = zip.get('xl/_rels/workbook.xml.rels')
  if (!workbook || !relationships) throw new RouteError(415, 'not a workbook')
  const relTargets = new Map()
  const relText = relationships.toString('utf8')
  const relPattern = /<Relationship\b([^>]*)\/?>/g
  let relMatch = relPattern.exec(relText)
  while (relMatch) {
    const attrs = relMatch[1]
    const id = /Id="([^"]+)"/.exec(attrs)
    const target = /Target="([^"]+)"/.exec(attrs)
    if (id && target) {
      relTargets.set(id[1], target[1].replace(/^\/?xl\//, '').replace(/^\//, ''))
    }
    relMatch = relPattern.exec(relText)
  }
  const shared = []
  const strings = zip.get('xl/sharedStrings.xml')
  if (strings) {
    const text = strings.toString('utf8')
    const siPattern = /<si>([\s\S]*?)<\/si>/g
    let siMatch = siPattern.exec(text)
    while (siMatch) {
      shared.push(sharedStringText(siMatch[1]))
      siMatch = siPattern.exec(text)
    }
  }
  const sheets = []
  const sheetXml = workbook.toString('utf8')
  const sheetPattern = /<sheet\b([^>]*)\/?>/g
  let sheetMatch = sheetPattern.exec(sheetXml)
  while (sheetMatch && sheets.length < 12) {
    const attrs = sheetMatch[1]
    const name = /name="([^"]+)"/.exec(attrs)
    const rid = /r:id="([^"]+)"/.exec(attrs) || /relationshipId="([^"]+)"/.exec(attrs)
    const target = rid ? relTargets.get(rid[1]) : null
    const body = target ? zip.get('xl/' + target) : null
    if (body && name) {
      sheets.push({ name: decodeXml(name[1]), rows: sheetRows(body.toString('utf8'), shared) })
    }
    sheetMatch = sheetPattern.exec(sheetXml)
  }
  if (sheets.length === 0) throw new RouteError(415, 'no sheets found')
  return { sheets }
}
/**
 * Pull the text of a docx paragraph, keeping tabs and line breaks.
 * @param {string} xml - paragraph body
 * @returns {string} plain text
 */
function docxParagraphText(xml) {
  // Tabs and breaks are empty elements, so swap them in before lifting the text.
  const prepared = String(xml)
    .replace(/<w:tab\b[^>]*\/?>/g, '\t')
    .replace(/<w:(?:br|cr)\b[^>]*\/?>/g, '\n')
  const parts = []
  prepared.replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, (match, inner) => {
    parts.push(decodeXml(inner))
    return match
  })
  return parts.join('')
}

/**
 * Turn one docx table into rows of cell text.
 * @param {string} xml - <w:tbl> block
 * @returns {Array<Array<string>>} rows
 */
function docxTableRows(xml) {
  const rows = []
  const rowPattern = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g
  let rowMatch = rowPattern.exec(xml)
  while (rowMatch && rows.length < 200) {
    const cells = []
    const cellPattern = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g
    let cellMatch = cellPattern.exec(rowMatch[1])
    while (cellMatch && cells.length < 40) {
      const paragraphs = []
      const pPattern = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g
      let pMatch = pPattern.exec(cellMatch[1])
      while (pMatch) {
        paragraphs.push(docxParagraphText(pMatch[1]))
        pMatch = pPattern.exec(cellMatch[1])
      }
      cells.push(paragraphs.join(' ').trim())
      cellMatch = cellPattern.exec(rowMatch[1])
    }
    rows.push(cells)
    rowMatch = rowPattern.exec(xml)
  }
  return rows
}

/**
 * Read the body of a docx into blocks the pane can lay out.
 * @param {Buffer} buffer - file bytes
 * @returns {{blocks: Array<object>, truncated: boolean, maxBlocks: number}} payload
 */
function readDocument(buffer) {
  const zip = readZip(buffer)
  const document = zip.get('word/document.xml')
  if (!document) throw new RouteError(415, 'not a Word document')
  let xml = document.toString('utf8')
  const tables = []
  xml = xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (block) => {
    tables.push(docxTableRows(block))
    return '\u0000TBL' + (tables.length - 1) + '\u0000'
  })
  const blocks = []
  const body = /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/.exec(xml)
  const source = body ? body[1] : xml
  const chunkPattern = /<w:p\b([^>]*)>([\s\S]*?)<\/w:p>|\u0000TBL(\d+)\u0000/g
  let chunk = chunkPattern.exec(source)
  while (chunk && blocks.length < 4000) {
    if (chunk[3] !== undefined) {
      const rows = tables[Number(chunk[3])] || []
      if (rows.length > 0) blocks.push({ type: 'table', rows })
    } else {
      const inner = chunk[2]
      const text = docxParagraphText(inner).trim()
      if (text.length > 0) {
        const style = /<w:pStyle w:val="([^"]+)"/.exec(inner)
        const numbered = /<w:numPr>/.test(inner)
        const name = style ? style[1] : ''
        let type = 'p'
        if (/^Heading([1-4])$/.test(name)) type = 'h' + name.slice(7)
        else if (numbered || /list/i.test(name)) type = 'li'
        blocks.push({ type, text })
      }
    }
    chunk = chunkPattern.exec(source)
  }
  if (blocks.length === 0) throw new RouteError(415, 'the document has no text')
  return { blocks, truncated: blocks.length >= 4000, maxBlocks: 4000 }
}
/**
 * Whether a request plausibly came from the DSH page itself.
 *
 * The route is served by the host web server, but plugin prefix handlers see
 * the request before the app shell does, so a page on any other origin could
 * otherwise read files or trigger the write routes. Browsers mark cross-site
 * requests with Sec-Fetch-Site and Origin, so refuse those; requests without
 * them (curl, the CLI, tests) keep working.
 * @param {import('node:http').IncomingMessage} req - request
 * @returns {boolean} true when the request may be served
 */
/**
 * Every route the plugin serves, with the methods it answers.
 * The connection gate authenticates each one before this table runs.
 */
const ROUTES = [
  { suffix: '/meta', methods: ['GET'] },
  { suffix: '/roots', methods: ['GET'] },
  { suffix: '/list', methods: ['GET'] },
  { suffix: '/read', methods: ['GET'] },
  { suffix: '/stat', methods: ['GET'] },
  { suffix: '/raw', methods: ['GET'] },
  { suffix: '/sheet', methods: ['GET'] },
  { suffix: '/document', methods: ['GET'] },
  { suffix: '/reveal', methods: ['POST'] },
  { suffix: '/open', methods: ['POST'] },
  { suffix: '/rename', methods: ['POST'] },
  { suffix: '/duplicate', methods: ['POST'] },
  { suffix: '/mkdir', methods: ['POST'] },
  { suffix: '/newfile', methods: ['POST'] },
  { suffix: '/trash', methods: ['POST'] },
  { suffix: '/transfer', methods: ['POST'] },
  { suffix: '/write', methods: ['POST'] },
  { suffix: '/download', methods: ['GET'] },
  { suffix: '/upload', methods: ['POST'] },
  { suffix: '/archive', methods: ['POST'] },
  { suffix: '/extract', methods: ['POST'] },
  { suffix: '/git', methods: ['GET'] },
]

/**
 * Adapt one Fetch request to the Node-style dispatcher underneath and turn the
 * captured response back into a Fetch response.
 * @param {Request} request - fetch request from the connection gate
 * @returns {Promise<Response>} fetch response
 */
async function handleFetch(request) {
  const url = new URL(request.url)
  // Uploads are the one route whose body must not be buffered in memory.
  if (url.pathname === PREFIX + '/upload') return handleUpload(request, url)
  const raw = request.method === 'GET' || request.method === 'HEAD'
    ? Buffer.alloc(0)
    : Buffer.from(await request.arrayBuffer())
  const req = Readable.from([raw])
  req.method = request.method
  req.url = url.pathname + url.search
  req.headers = Object.fromEntries(request.headers.entries())

  let status = 200
  let headers = {}
  let payload = Buffer.alloc(0)
  const res = {
    writeHead(code, extra) {
      status = code
      headers = extra || {}
    },
    end(chunk) {
      if (chunk === undefined || chunk === null) return
      payload = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    },
  }
  await handleRequest(req, res)
  return new Response(payload, { status, headers })
}
/**
 * Answer the sheet route: an .xlsx/.xlsm workbook parsed into named sheets.
 * @param {string} target - canonical file path
 * @returns {Promise<object>} { sheets, truncated }
 */
async function readDocumentRoute(target) {
  const info = await stat(target)
  if (info.isDirectory()) throw new RouteError(400, 'path is a folder')
  const ext = extname(target).toLowerCase()
  if (ext !== '.docx' && ext !== '.docm') throw new RouteError(415, 'only .docx and .docm can be parsed')
  if (info.size > MAX_SHEET_BYTES) throw new RouteError(413, 'document is too large')
  return readDocument(await readFile(target))
}

async function readSheet(target) {
  const info = await stat(target)
  if (info.isDirectory()) throw new RouteError(400, 'path is a folder')
  const ext = extname(target).toLowerCase()
  if (ext !== '.xlsx' && ext !== '.xlsm') throw new RouteError(415, 'only .xlsx and .xlsm can be parsed')
  if (info.size > MAX_SHEET_BYTES) throw new RouteError(413, 'workbook is too large')
  const parsed = readWorkbook(await readFile(target))
  return {
    sheets: parsed.sheets,
    truncated: parsed.sheets.some(sheet => sheet.rows.length >= MAX_SHEET_ROWS),
    maxRows: MAX_SHEET_ROWS,
  }
}

/**
 * Answer one file with its bytes, so the browser can build a File and hand it
 * to the conversation composer (the "添加到会话" action).
 * @param {import('node:http').ServerResponse} res - response
 * @param {string} target - absolute path inside the root
 * @returns {Promise<void>} resolves after the response is written
 */
async function sendRaw(res, target) {
  const info = await stat(target)
  if (info.isDirectory()) throw new RouteError(400, 'path is a folder')
  if (info.size > 64 * 1024 * 1024) throw new RouteError(413, '文件超过 64 MB')
  const data = await readFile(target)
  const type = mimeOf(target)
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': data.length,
    'Cache-Control': 'no-store',
  })
  res.end(data)
}

/**
 * Content type for a file, guessed from its extension.
 * @param {string} target - file path
 * @returns {string} mime type
 */
function mimeOf(target) {
  const ext = extname(target).toLowerCase()
  const table = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
    '.pdf': 'application/pdf', '.zip': 'application/zip',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.htm': 'text/html; charset=utf-8', '.html': 'text/html; charset=utf-8',
    '.tsv': 'text/tab-separated-values; charset=utf-8',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/opus',
    '.aiff': 'audio/aiff', '.aif': 'audio/aiff',
    '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
    '.webm': 'video/webm', '.ogv': 'video/ogg',
  }
  if (table[ext]) return table[ext]
  if (TEXT_EXTENSIONS.has(ext.slice(1)) || TEXT_EXTENSIONS.has(ext)) return 'text/plain; charset=utf-8'
  return 'application/octet-stream'
}

/**
 * Collect a request body, refusing anything unreasonably large.
 * @param {import('node:http').IncomingMessage} req - request
 * @returns {Promise<string>} raw body text
 */
function readBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1_000_000) {
        rejectPromise(new RouteError(413, '请求内容过大'))
        req.destroy()
      }
    })
    req.on('end', () => resolvePromise(raw))
    req.on('error', error => rejectPromise(error))
  })
}

/**
 * Dispatch one HTTP request to its route. The web server's `resource` routes
 * answer GET and HEAD only, so the whole API is registered as one handler that
 * owns its responses and can therefore also serve the write actions.
 * @param {import('node:http').IncomingMessage} req - request
 * @param {import('node:http').ServerResponse} res - response
 * @returns {Promise<void>} resolves after the response is written
 */
async function handleRequest(req, res) {
  const url = new URL(req.url || '/', 'http://localhost')
  const route = url.pathname.slice(PREFIX.length) || '/'
  const method = req.method || 'GET'
  const path = url.searchParams.get('path')
  const name = url.searchParams.get('name')
  try {
    if (route === '/meta' && method === 'GET') {
      send(res, 200, await readMeta())
      return
    }
    if (route === '/roots' && method === 'GET') {
      send(res, 200, { roots: [{ label: basename(ROOT), path: ROOT }] })
      return
    }
    if (route === '/list' && method === 'GET') {
      send(res, 200, await listDirectory(await safePath(path)))
      return
    }
    if (route === '/read' && method === 'GET') {
      send(res, 200, await readPreview(await safePath(path)))
      return
    }
    if (route === '/stat' && method === 'GET') {
      send(res, 200, await statEntry(await safePath(path)))
      return
    }
    if (route === '/raw' && method === 'GET') {
      await sendRaw(res, await safePath(path))
      return
    }
    if (route === '/sheet' && method === 'GET') {
      send(res, 200, await readSheet(await safePath(path)))
      return
    }
    if (route === '/document' && method === 'GET') {
      send(res, 200, await readDocumentRoute(await safePath(path)))
      return
    }
    if (route === '/reveal' && method === 'POST') {
      send(res, 200, await reveal(await safePath(path)))
      return
    }
    if (route === '/open' && method === 'POST') {
      send(res, 200, await openWithDefault(await safePath(path)))
      return
    }
    if (route === '/rename' && method === 'POST') {
      send(res, 200, await renameEntry(await safePath(path), name))
      return
    }
    if (route === '/duplicate' && method === 'POST') {
      send(res, 200, await duplicateEntry(await safePath(path)))
      return
    }
    if (route === '/mkdir' && method === 'POST') {
      send(res, 200, await createDirectory(await safePath(path), name))
      return
    }
    if (route === '/newfile' && method === 'POST') {
      send(res, 200, await createFile(await safePath(path), name))
      return
    }
    if (route === '/trash' && method === 'POST') {
      send(res, 200, await moveToTrash(await safePath(path)))
      return
    }
    if (route === '/transfer' && method === 'POST') {
      const raw = await readBody(req)
      let body = {}
      try {
        body = raw.length > 0 ? JSON.parse(raw) : {}
      } catch {
        throw new RouteError(400, '请求内容无法解析')
      }
      send(res, 200, await transfer(body || {}))
      return
    }
    if (route === '/write' && method === 'POST') {
      const body = await readJsonBody(req)
      send(res, 200, await writeTextRoute(path, body.text))
      return
    }
    if (route === '/download' && method === 'GET') {
      await sendAttachment(res, await safePath(path))
      return
    }
    if (route === '/archive' && method === 'POST') {
      send(res, 200, await createArchive(await readJsonBody(req)))
      return
    }
    if (route === '/extract' && method === 'POST') {
      send(res, 200, await extractArchive(await readJsonBody(req)))
      return
    }
    if (route === '/git' && method === 'GET') {
      send(res, 200, await gitStatusRoute(await safePath(path)))
      return
    }
    send(res, 404, { error: 'not-found', route, method })
  } catch (error) {
    if (error instanceof RouteError) {
      send(res, error.status, { error: 'request-failed', message: error.message })
      return
    }
    const code = error && error.code
    const status = code === 'EACCES' || code === 'EPERM' ? 403 : code === 'ENOENT' ? 404 : code === 'EEXIST' ? 409 : 500
    send(res, status, { error: 'request-failed', message: String(error && error.message ? error.message : error) })
  }
}

/**
 * Read a JSON request body, tolerating an empty one.
 * @param {import('node:http').IncomingMessage} req - request
 * @returns {Promise<Record<string, any>>} parsed body
 */
async function readJsonBody(req) {
  const raw = await readBody(req)
  if (raw.length === 0) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    throw new RouteError(400, '请求内容无法解析')
  }
}

/* --------------------------------------------------------------- uploads */

/** Largest single upload written to disk, in bytes. */
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024

/**
 * Build a JSON Fetch response.
 * @param {number} status - HTTP status
 * @param {unknown} payload - serializable body
 * @returns {Response} response
 */
function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * Turn any thrown error into the response shape the client expects.
 * @param {unknown} error - thrown value
 * @returns {Response} response
 */
function errorResponse(error) {
  if (error instanceof RouteError) {
    return json(error.status, { error: 'request-failed', message: error.message })
  }
  const code = error && error.code
  const status = code === 'EACCES' || code === 'EPERM' ? 403 : code === 'ENOENT' ? 404 : code === 'EEXIST' ? 409 : 500
  return json(status, { error: 'request-failed', message: String(error && error.message ? error.message : error) })
}

/**
 * Stream one browser upload into the target folder. The bytes never sit in
 * memory: the connection gate hands over the request body as a stream.
 * @param {Request} request - fetch request
 * @param {URL} url - request URL
 * @returns {Promise<Response>} response
 */
async function handleUpload(request, url) {
  let temp
  try {
    const dir = await safePath(url.searchParams.get('path'))
    const info = await stat(dir)
    if (!info.isDirectory()) throw new RouteError(400, 'path is a folder')
    const name = safeName(url.searchParams.get('name'))
    const target = await freePath(dir, name)
    temp = join(dir, `.dsh-upload-${process.pid}-${Date.now()}`)
    const sink = createWriteStream(temp, { flags: 'wx' })
    const finished = new Promise((resolvePromise, rejectPromise) => {
      sink.on('close', resolvePromise)
      sink.on('error', rejectPromise)
    })
    let total = 0
    try {
      if (request.body) {
        for await (const chunk of request.body) {
          total += chunk.length
          if (total > MAX_UPLOAD_BYTES) throw new RouteError(413, 'upload is larger than 512 MB')
          if (!sink.write(chunk)) await once(sink, 'drain')
        }
      }
      sink.end()
      await finished
    } catch (error) {
      sink.destroy()
      await rm(temp, { force: true }).catch(() => undefined)
      throw error
    }
    await rename(temp, target)
    temp = undefined
    return json(200, { ok: true, path: target, name: basename(target), size: total })
  } catch (error) {
    if (temp) await rm(temp, { force: true }).catch(() => undefined)
    return errorResponse(error)
  }
}

/** Largest archive built in memory, in bytes. */
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
/** Most entries one archive may hold. */
const MAX_ARCHIVE_ENTRIES = 5000

/** CRC-32 lookup table for the ZIP writer. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[i] = value >>> 0
  }
  return table
})()

/**
 * CRC-32 of a buffer, as the ZIP format stores it.
 * @param {Buffer} buffer - bytes
 * @returns {number} checksum
 */
function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * MS-DOS date and time fields for one entry.
 * @param {Date} date - timestamp
 * @returns {{ time: number, day: number }} packed fields
 */
function dosStamp(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

/**
 * Write a ZIP archive in memory, deflating each entry when that helps.
 * @param {{ name: string, data: Buffer, mtime: Date }[]} entries - archive contents
 * @returns {Buffer} the archive
 */
function buildZip(entries) {
  const parts = []
  const central = []
  let offset = 0
  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name.replaceAll('\\\\', '/'), 'utf8')
    const deflated = deflateRawSync(entry.data, { level: 6 })
    const method = deflated.length < entry.data.length ? 8 : 0
    const body = method === 8 ? deflated : entry.data
    const checksum = crc32(entry.data)
    const stamp = dosStamp(entry.mtime instanceof Date ? entry.mtime : new Date())
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(stamp.time, 10)
    local.writeUInt16LE(stamp.day, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    local.writeUInt16LE(0, 28)
    parts.push(local, nameBuffer, body)
    central.push({ nameBuffer, method, checksum, size: body.length, raw: entry.data.length, offset, stamp })
    offset += local.length + nameBuffer.length + body.length
  }
  const directoryStart = offset
  for (const entry of central) {
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(0x0800, 8)
    header.writeUInt16LE(entry.method, 10)
    header.writeUInt16LE(entry.stamp.time, 12)
    header.writeUInt16LE(entry.stamp.day, 14)
    header.writeUInt32LE(entry.checksum, 16)
    header.writeUInt32LE(entry.size, 20)
    header.writeUInt32LE(entry.raw, 24)
    header.writeUInt16LE(entry.nameBuffer.length, 28)
    header.writeUInt16LE(0, 30)
    header.writeUInt16LE(0, 32)
    header.writeUInt16LE(0, 34)
    header.writeUInt16LE(0, 36)
    header.writeUInt32LE(0, 38)
    header.writeUInt32LE(entry.offset, 42)
    parts.push(header, entry.nameBuffer)
    offset += header.length + entry.nameBuffer.length
  }
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(central.length, 8)
  end.writeUInt16LE(central.length, 10)
  end.writeUInt32LE(offset - directoryStart, 12)
  end.writeUInt32LE(directoryStart, 16)
  parts.push(end)
  return Buffer.concat(parts)
}

/**
 * Gather files for an archive, keeping relative names under one folder.
 * @param {string[]} targets - canonical absolute paths
 * @returns {Promise<{ entries: { name: string, data: Buffer, mtime: Date }[], total: number, truncated: boolean }>} archive contents
 */
async function collectZipEntries(targets) {
  const entries = []
  let total = 0
  let truncated = false
  const walk = async (target, prefix) => {
    if (entries.length >= MAX_ARCHIVE_ENTRIES) { truncated = true; return }
    const info = await lstat(target)
    if (info.isSymbolicLink()) return
    if (info.isDirectory()) {
      const children = await readdir(target, { withFileTypes: true })
      entries.push({ name: prefix + '/', data: Buffer.alloc(0), mtime: info.mtime })
      for (const child of children) {
        await walk(join(target, child.name), prefix + '/' + child.name)
        if (entries.length >= MAX_ARCHIVE_ENTRIES) { truncated = true; return }
      }
      return
    }
    if (total + info.size > MAX_ARCHIVE_BYTES) { truncated = true; return }
    const data = await readFile(target)
    total += data.length
    entries.push({ name: prefix, data, mtime: info.mtime })
  }
  for (const target of targets) await walk(target, basename(target))
  return { entries, total, truncated }
}

/**
 * Answer the archive route: zip one or more items beside themselves.
 * @param {object} body - { sources: string[] }
 * @returns {Promise<object>} { path, size, entries, truncated }
 */
async function createArchive(body) {
  const sources = Array.isArray(body?.sources) ? body.sources : []
  if (sources.length === 0) throw new RouteError(400, 'nothing to archive')
  const targets = []
  for (const source of sources) targets.push(await safePath(source))
  const { entries, total, truncated } = await collectZipEntries(targets)
  if (entries.length === 0) throw new RouteError(400, 'nothing to archive')
  const archive = buildZip(entries)
  if (archive.length > MAX_ARCHIVE_BYTES) throw new RouteError(413, 'archive would be larger than 256 MB')
  const first = targets[0]
  const dir = (await stat(first)).isDirectory() ? dirname(first) : dirname(first)
  const target = await freePath(dir, (basename(first) || 'archive') + '.zip')
  await writeFile(target, archive)
  const written = await stat(target)
  return { ok: true, path: target, name: basename(target), size: written.size, entries: entries.length, bytes: total, truncated }
}

/**
 * Answer the extract route: unpack a .zip beside itself or into a folder.
 * @param {object} body - { path: string, target?: string }
 * @returns {Promise<object>} { path, files, skipped }
 */
async function extractArchive(body) {
  const source = await safePath(body?.path)
  const info = await stat(source)
  if (info.isDirectory()) throw new RouteError(400, 'path is a folder')
  if (!/\.zip$/i.test(source)) throw new RouteError(415, 'only .zip archives can be extracted')
  if (info.size > MAX_ARCHIVE_BYTES) throw new RouteError(413, 'archive is larger than 256 MB')
  const buffer = await readFile(source)
  const entries = readZip(buffer)
  if (entries.size === 0) throw new RouteError(400, 'archive is empty')
  let dir
  if (body?.target) {
    dir = await safePath(body.target)
    if (!(await stat(dir)).isDirectory()) throw new RouteError(400, 'target is not a folder')
    dir = await freePath(dirname(join(dir, '.')), basename(source).replace(/\.zip$/i, ''))
    await mkdir(dir, { recursive: true })
  } else {
    dir = await freePath(dirname(source), basename(source).replace(/\.zip$/i, ''))
    await mkdir(dir, { recursive: true })
  }
  let files = 0
  let skipped = 0
  for (const [name, data] of entries) {
    if (name.endsWith('/')) { skipped += 1; continue }
    const relative = name.replace(/^\/+/, '')
    if (relative.split('/').some(segment => segment === '..')) { skipped += 1; continue }
    const target = resolve(dir, relative)
    if (target !== dir && !target.startsWith(dir + sep)) { skipped += 1; continue }
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, data)
    files += 1
  }
  return { ok: true, path: dir, files, skipped }
}

/**
 * Answer the download route: send one file as an attachment.
 * @param {import('node:http').ServerResponse} res - response sink
 * @param {string} target - canonical file path
 * @returns {Promise<void>} resolves after the response is written
 */
async function sendAttachment(res, target) {
  const info = await stat(target)
  if (info.isDirectory()) throw new RouteError(400, 'path is a folder')
  if (info.size > 512 * 1024 * 1024) throw new RouteError(413, 'file is larger than 512 MB')
  const data = await readFile(target)
  res.writeHead(200, {
    'Content-Type': mimeOf(target),
    'Content-Length': data.length,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(basename(target))}`,
    'Cache-Control': 'no-store',
  })
  res.end(data)
}

/**
 * Save the text the editor holds, refusing anything that would not round-trip.
 * @param {string | null} rawPath - path from the query string
 * @param {unknown} text - new file contents
 * @returns {Promise<object>} { ok, path, size, mtime }
 */
async function writeTextRoute(rawPath, text) {
  const target = await safePath(rawPath)
  const info = await stat(target)
  if (info.isDirectory()) throw new RouteError(400, 'path is a folder')
  if (typeof text !== 'string') throw new RouteError(400, 'text is required')
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > MAX_TEXT_BYTES * 8) throw new RouteError(413, 'text is too large')
  await writeFile(target, text, 'utf8')
  const after = await stat(target)
  return { ok: true, path: target, size: after.size, mtime: after.mtimeMs }
}

/** Most git entries the status route reports. */
const MAX_GIT_ENTRIES = 5000

/**
 * Run one git command inside a directory, with optional locks disabled so the
 * index is never rewritten by a read-only status call.
 * @param {string} dir - working directory
 * @param {string[]} args - git arguments
 * @returns {Promise<string>} stdout
 */
function gitIn(dir, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile('git', ['-C', dir, ...args], {
      timeout: 8000,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    }, (error, stdout) => {
      if (error) rejectPromise(error)
      else resolvePromise(String(stdout))
    })
  })
}

/**
 * Answer the git route: porcelain status for the repository that holds a folder.
 * @param {string} dir - canonical directory
 * @returns {Promise<object>} { repo, entries: Record<string, string> }
 */
async function gitStatusRoute(dir) {
  const info = await stat(dir)
  if (!info.isDirectory()) throw new RouteError(400, 'path is a folder')
  let repo
  try {
    repo = (await gitIn(dir, ['rev-parse', '--show-toplevel'])).trim()
  } catch {
    return { repo: null, entries: {} }
  }
  if (!repo) return { repo: null, entries: {} }
  let out = ''
  try {
    out = await gitIn(dir, ['status', '--porcelain', '-z', '--untracked-files=normal'])
  } catch {
    return { repo, entries: {} }
  }
  const entries = {}
  const records = out.split('\u0000')
  for (let i = 0; i < records.length && Object.keys(entries).length < MAX_GIT_ENTRIES; i += 1) {
    const record = records[i]
    if (record.length < 4) continue
    const code = record.slice(0, 2)
    const relative = record.slice(3)
    if (code.startsWith('R') || code.startsWith('C')) i += 1
    const absolute = join(repo, relative)
    const letter = code === '??' ? 'untracked' : code.includes('U') || code === 'AA' || code === 'DD' ? 'conflict' : code[0] !== ' ' ? code[0] : code[1]
    entries[absolute] = letter
  }
  return { repo, entries }
}

/**
 * Register the file API while the plugin is active.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context
 */
export function apply(ctx) {
  for (const route of ROUTES) {
    ctx.effect(
      () => ctx.connection.fetch.register({
        path: PREFIX + route.suffix,
        methods: route.methods,
        requestBody: 'buffered',
        fetch: handleFetch,
      }),
      `dsh-file-explorer: ${route.suffix} route`,
    )
  }
}
