import { app, net } from 'electron'

const UA = () => `Typeshelf/${app.getVersion()} (+font manager)`

/** fetch with timeout + retries, routed through Chromium's network stack (honours system proxy). */
export async function request(url: string, opts: { timeoutMs?: number; retries?: number; userAgent?: string } = {}): Promise<Response> {
  const { timeoutMs = 30000, retries = 2, userAgent = UA() } = opts
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await net.fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': userAgent } })
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status} for ${url}`)
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} for ${url}`)
        ;(err as Error & { fatal?: boolean }).fatal = true
        throw err
      }
      return res
    } catch (e) {
      lastErr = e
      if ((e as { fatal?: boolean }).fatal) break
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export async function getText(url: string, userAgent?: string): Promise<string> {
  return (await request(url, { userAgent })).text()
}

export async function getJson<T>(url: string): Promise<T> {
  return JSON.parse(await getText(url)) as T
}

export async function getBuffer(url: string): Promise<Buffer> {
  const res = await request(url, { timeoutMs: 120000 })
  return Buffer.from(await res.arrayBuffer())
}

/** Make protocol-relative URLs absolute so CSS works from file:// pages. */
export function absolutizeCss(css: string): string {
  return css.replace(/url\((['"]?)\/\//g, 'url($1https://')
}
