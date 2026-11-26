/**
 * Minimal ZIP reader used by the host test to inspect the archive route's
 * output. It only understands stored and deflated entries, which is all the
 * plugin writes.
 */

import { inflateRawSync } from 'node:zlib'

/**
 * Read every entry out of an archive.
 * @param {Buffer} buffer - whole archive
 * @returns {Map<string, Buffer>} entry name -> bytes
 */
export function readZipForTest(buffer) {
  const entries = new Map()
  let offset = 0
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8)
    const compressed = buffer.readUInt32LE(offset + 18)
    const nameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLength)
    const dataStart = offset + 30 + nameLength + extraLength
    const data = buffer.subarray(dataStart, dataStart + compressed)
    entries.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data))
    offset = dataStart + compressed
  }
  return entries
}
