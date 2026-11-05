// Rasterizes the Typeshelf icon (same geometry as build/icon.svg) to build/icon.png
// in pure Node, so it works in CI without a GPU or browser.
// Usage: node scripts/make-icon.cjs
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const zlib = require('node:zlib')

const S = 512
const SS = 4 // supersampling per axis

// Signed-distance test for a rounded rectangle.
function inRoundRect(px, py, x, y, w, h, r) {
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  if (px < x || px > x + w || py < y || py > y + h) return false
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const A = hex('#7c6cff')
const B = hex('#3fb6ff')

// Layers painted bottom to top: [test(x,y), colorFn(x,y), alpha]
const layers = [
  [(x, y) => inRoundRect(x, y, 24, 24, 464, 464, 112), (x, y) => {
    const t = Math.min(1, Math.max(0, (x - 24 + (y - 24)) / (2 * 464)))
    return A.map((a, i) => a + (B[i] - a) * t)
  }, 1],
  [(x, y) => inRoundRect(x, y, 104, 372, 304, 22, 11), () => [255, 255, 255], 0.9],
  [(x, y) => inRoundRect(x, y, 128, 168, 52, 192, 12), () => [255, 255, 255], 0.55],
  [(x, y) => inRoundRect(x, y, 332, 200, 52, 160, 12), () => [255, 255, 255], 0.55],
  [(x, y) => inRoundRect(x, y, 182, 120, 148, 54, 14) || (x >= 230 && x <= 282 && y >= 160 && y <= 360), () => [255, 255, 255], 1]
]

const px = Buffer.alloc(S * S * 4)
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const fx = x + (sx + 0.5) / SS
        const fy = y + (sy + 0.5) / SS
        // Composite layers ("over") for this sample, premultiplied.
        let cr = 0, cg = 0, cb = 0, ca = 0
        for (const [test, color, alpha] of layers) {
          if (!test(fx, fy)) continue
          const c = color(fx, fy)
          cr = c[0] * alpha + cr * (1 - alpha)
          cg = c[1] * alpha + cg * (1 - alpha)
          cb = c[2] * alpha + cb * (1 - alpha)
          ca = alpha + ca * (1 - alpha)
        }
        r += cr; g += cg; b += cb; a += ca
      }
    }
    const n = SS * SS
    const i = (y * S + x) * 4
    const alpha = a / n
    px[i] = alpha ? Math.round(r / n / alpha) : 0
    px[i + 1] = alpha ? Math.round(g / n / alpha) : 0
    px[i + 2] = alpha ? Math.round(b / n / alpha) : 0
    px[i + 3] = Math.round(alpha * 255)
  }
}

// --- PNG encoder ---
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(buf) {
  let c = -1
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const raw = Buffer.alloc((S * 4 + 1) * S)
for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4)
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])
writeFileSync(join(__dirname, '..', 'build', 'icon.png'), png)
console.log(`icon written (${png.length} bytes)`)
