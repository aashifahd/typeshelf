import { useEffect, useState } from 'react'
import type { FaceInfo } from '@shared/types'

/**
 * Registers local font files as CSS FontFaces on demand. Each face gets its own
 * unique family name so styles never get confused, and the name embeds the file
 * mtime so an updated file is picked up automatically.
 */
type Status = 'loading' | 'ready' | 'failed'

const status = new Map<string, Status>()
const waiters = new Map<string, Set<() => void>>()
const queue: FaceInfo[] = []
let inflight = 0
const MAX_INFLIGHT = 6

export const isMock = (): boolean => Boolean((window as unknown as { __TYPESHELF_MOCK__?: boolean }).__TYPESHELF_MOCK__)

export function cssName(face: FaceInfo): string {
  return `ts-${face.id}-${face.mtime}`
}

export function fontStack(face: FaceInfo): string {
  // A blank fallback keeps unloaded text from flashing in the UI font.
  return `"${cssName(face)}", "Adobe NotDef", system-ui`
}

function notify(name: string): void {
  waiters.get(name)?.forEach((cb) => cb())
}

function pump(): void {
  while (inflight < MAX_INFLIGHT && queue.length) {
    const face = queue.shift()!
    const name = cssName(face)
    inflight++
    const src = isMock()
      ? `local("${face.fullName}"), local("${face.postscriptName}")`
      : `url("tsfont://face/${face.id}?v=${face.mtime}")`
    const ff = new FontFace(name, src, face.variable ? { weight: '1 1000', stretch: '25% 200%' } : {})
    ff.load()
      .then((loaded) => {
        document.fonts.add(loaded)
        status.set(name, 'ready')
      })
      .catch(() => status.set(name, 'failed'))
      .finally(() => {
        inflight--
        notify(name)
        pump()
      })
  }
}

export function ensureFace(face: FaceInfo): Status {
  const name = cssName(face)
  const s = status.get(name)
  if (s) return s
  status.set(name, 'loading')
  queue.push(face)
  pump()
  return 'loading'
}

/** Hook: returns the load status of a face and triggers loading. */
export function useFace(face: FaceInfo | undefined): Status {
  const [, force] = useState(0)
  const name = face ? cssName(face) : ''
  const s = face ? ensureFace(face) : 'failed'
  useEffect(() => {
    if (!face || s !== 'loading') return
    const cb = (): void => force((n) => n + 1)
    if (!waiters.has(name)) waiters.set(name, new Set())
    waiters.get(name)!.add(cb)
    return () => {
      waiters.get(name)?.delete(cb)
    }
  }, [name, s, face])
  return s
}

// ---- Provider (Google / Fontshare) preview stylesheets ----
const loadedProviderKeys = new Set<string>()
let pending: { provider: 'google' | 'fontshare'; keys: Set<string>; timer: number } | null = null

export function requestProviderPreview(provider: 'google' | 'fontshare', key: string): void {
  const id = `${provider}:${key}`
  if (loadedProviderKeys.has(id)) return
  loadedProviderKeys.add(id)
  if (pending && pending.provider !== provider) flush()
  if (!pending) pending = { provider, keys: new Set(), timer: window.setTimeout(flush, 120) }
  pending.keys.add(key)
}

function flush(): void {
  if (!pending) return
  const { provider, keys, timer } = pending
  clearTimeout(timer)
  pending = null
  void window.typeshelf.getPreviewCss(provider, [...keys]).then((css) => {
    if (!css) return
    const style = document.createElement('style')
    style.dataset.provider = provider
    style.textContent = css
    document.head.appendChild(style)
  })
}
