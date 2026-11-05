/**
 * Extract a single font from a TrueType/OpenType collection (.ttc/.otc) into a
 * standalone sfnt buffer. Browsers only load the first face of a collection,
 * so this lets every face be previewed.
 */
export function extractFromCollection(buf: Buffer, index: number): Buffer {
  if (buf.toString('latin1', 0, 4) !== 'ttcf') return buf
  const numFonts = buf.readUInt32BE(8)
  if (index < 0 || index >= numFonts) throw new Error(`Face ${index} not in collection of ${numFonts}`)
  const off = buf.readUInt32BE(12 + index * 4)
  const sfntVersion = buf.readUInt32BE(off)
  const numTables = buf.readUInt16BE(off + 4)

  const tables: { tag: Buffer; checksum: number; data: Buffer }[] = []
  for (let i = 0; i < numTables; i++) {
    const rec = off + 12 + i * 16
    const tOff = buf.readUInt32BE(rec + 8)
    const tLen = buf.readUInt32BE(rec + 12)
    if (tOff + tLen > buf.length) throw new Error('Corrupt collection table directory')
    tables.push({ tag: buf.subarray(rec, rec + 4), checksum: buf.readUInt32BE(rec + 4), data: buf.subarray(tOff, tOff + tLen) })
  }

  const headerLen = 12 + numTables * 16
  const total = tables.reduce((n, t) => n + ((t.data.length + 3) & ~3), headerLen)
  const out = Buffer.alloc(total)
  out.writeUInt32BE(sfntVersion, 0)
  out.writeUInt16BE(numTables, 4)
  let pow = 1
  let log2 = 0
  while (pow * 2 <= numTables) {
    pow *= 2
    log2++
  }
  out.writeUInt16BE(pow * 16, 6)
  out.writeUInt16BE(log2, 8)
  out.writeUInt16BE(numTables * 16 - pow * 16, 10)

  let dataOff = headerLen
  tables.forEach((t, i) => {
    const rec = 12 + i * 16
    t.tag.copy(out, rec)
    out.writeUInt32BE(t.checksum, rec + 4)
    out.writeUInt32BE(dataOff, rec + 8)
    out.writeUInt32BE(t.data.length, rec + 12)
    t.data.copy(out, dataOff)
    dataOff += (t.data.length + 3) & ~3
  })
  return out
}
