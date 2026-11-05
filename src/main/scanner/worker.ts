// Runs in a worker_thread so parsing hundreds of fonts never blocks the UI.
import { parentPort } from 'node:worker_threads'
import { readFileSync } from 'node:fs'
import * as fontkit from 'fontkit'
import { describeFace } from './parse'
import type { BrokenFont, FaceInfo, GlyphInfo } from '@shared/types'

export interface ParseJob {
  path: string
  sourceId: string
  size: number
  mtime: number
}

export type WorkerRequest =
  | { type: 'parse'; reqId: number; jobs: ParseJob[] }
  | { type: 'glyphs'; reqId: number; path: string; index: number }
  | { type: 'validate'; reqId: number; paths: string[] }

export type WorkerResponse =
  | { type: 'progress'; reqId: number; done: number; total: number; current: string }
  | { type: 'parsed'; reqId: number; faces: FaceInfo[]; broken: BrokenFont[] }
  | { type: 'glyphs'; reqId: number; glyphs: GlyphInfo[] }
  | { type: 'validated'; reqId: number; errors: { path: string; error: string }[] }
  | { type: 'error'; reqId: number; error: string }

const MAX_GLYPHS = 40000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function open(path: string): { fonts: any[]; isCollection: boolean } {
  const buf = readFileSync(path)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f: any = fontkit.create(buf)
  if (f && Array.isArray(f.fonts)) return { fonts: f.fonts, isCollection: true }
  return { fonts: [f], isCollection: false }
}

function post(msg: WorkerResponse): void {
  parentPort!.postMessage(msg)
}

parentPort!.on('message', (msg: WorkerRequest) => {
  try {
    if (msg.type === 'parse') {
      const faces: FaceInfo[] = []
      const broken: BrokenFont[] = []
      msg.jobs.forEach((job, i) => {
        try {
          const { fonts, isCollection } = open(job.path)
          fonts.forEach((font, index) => {
            faces.push(describeFace(font, { ...job, index, isCollection }))
          })
        } catch (e) {
          broken.push({ path: job.path, sourceId: job.sourceId, error: (e as Error).message })
        }
        if (i % 10 === 0 || i === msg.jobs.length - 1) {
          post({ type: 'progress', reqId: msg.reqId, done: i + 1, total: msg.jobs.length, current: job.path })
        }
      })
      post({ type: 'parsed', reqId: msg.reqId, faces, broken })
    } else if (msg.type === 'glyphs') {
      const { fonts } = open(msg.path)
      const font = fonts[msg.index] ?? fonts[0]
      const cps: number[] = Array.from(new Set<number>(font.characterSet as number[]))
        .sort((a, b) => a - b)
        .slice(0, MAX_GLYPHS)
      const glyphs: GlyphInfo[] = cps.map((cp) => {
        let name = ''
        try {
          name = font.glyphForCodePoint(cp)?.name ?? ''
        } catch {
          /* some fonts have broken post tables */
        }
        return { cp, name }
      })
      post({ type: 'glyphs', reqId: msg.reqId, glyphs })
    } else if (msg.type === 'validate') {
      const errors: { path: string; error: string }[] = []
      for (const p of msg.paths) {
        try {
          const { fonts } = open(p)
          if (!fonts.length || !fonts[0] || !(fonts[0].numGlyphs > 0)) errors.push({ path: p, error: 'No glyphs' })
        } catch (e) {
          errors.push({ path: p, error: (e as Error).message })
        }
      }
      post({ type: 'validated', reqId: msg.reqId, errors })
    }
  } catch (e) {
    post({ type: 'error', reqId: msg.reqId, error: (e as Error).message })
  }
})
