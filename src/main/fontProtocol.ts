import { protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { library } from './library'
import { extractFromCollection } from './sfnt'
import log from './log'

export const FONT_SCHEME = 'tsfont'

const MIME: Record<string, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  ttc: 'font/ttf',
  otc: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2'
}

/** Must run before app 'ready'. */
export function registerFontScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: FONT_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
  ])
}

// Small LRU so scrolling back and forth doesn't re-read big files.
const cache = new Map<string, Buffer>()
const MAX_CACHE_BYTES = 150 * 1024 * 1024
let cacheBytes = 0

function remember(id: string, buf: Buffer): void {
  cache.set(id, buf)
  cacheBytes += buf.length
  while (cacheBytes > MAX_CACHE_BYTES && cache.size > 1) {
    const [oldest, b] = cache.entries().next().value as [string, Buffer]
    cache.delete(oldest)
    cacheBytes -= b.length
  }
}

/** Serves `tsfont://face/<faceId>`. Only files present in the index are readable. */
export function handleFontScheme(): void {
  protocol.handle(FONT_SCHEME, async (req) => {
    try {
      const url = new URL(req.url)
      const id = url.pathname.replace(/^\/+/, '')
      if (url.hostname !== 'face' || !/^[a-f0-9]{16}$/.test(id)) return new Response('bad request', { status: 400 })
      const face = library.faceById(id)
      if (!face) return new Response('not found', { status: 404 })
      // Keyed by mtime so updated / hot-reloaded files are never served stale.
      const ck = `${id}:${face.mtime}`
      let buf = cache.get(ck)
      if (buf) {
        cache.delete(ck)
        cache.set(ck, buf)
      } else {
        const raw = await readFile(face.path)
        buf = face.format === 'ttc' || face.format === 'otc' ? extractFromCollection(raw, face.index) : raw
        remember(ck, buf)
      }
      return new Response(new Uint8Array(buf), {
        headers: {
          'content-type': MIME[face.format] ?? 'application/octet-stream',
          'cache-control': 'no-cache',
          'access-control-allow-origin': '*'
        }
      })
    } catch (e) {
      log.warn('font protocol error', req.url, e)
      return new Response('error', { status: 500 })
    }
  })
}

export function invalidateFontCache(): void {
  cache.clear()
  cacheBytes = 0
}
