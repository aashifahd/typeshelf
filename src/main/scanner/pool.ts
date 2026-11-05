import { cpus } from 'node:os'
import type { Worker } from 'node:worker_threads'
import createWorker from './worker?nodeWorker'
import type { ParseJob, WorkerRequest, WorkerResponse } from './worker'
import type { BrokenFont, FaceInfo, GlyphInfo } from '@shared/types'
import log from '../log'

type Pending = {
  resolve: (r: WorkerResponse) => void
  reject: (e: Error) => void
  onProgress?: (done: number) => void
}

// Distributive Omit so each variant of the union keeps its own fields.
type RequestBody = WorkerRequest extends infer T ? (T extends WorkerRequest ? Omit<T, 'reqId'> : never) : never

class ScanPool {
  private workers: Worker[] = []
  private pending = new Map<number, Pending>()
  private nextId = 1
  private rr = 0

  private ensure(): void {
    if (this.workers.length) return
    const n = Math.max(1, Math.min(4, cpus().length - 1))
    for (let i = 0; i < n; i++) this.workers.push(this.spawn())
  }

  private spawn(): Worker {
    const w = createWorker({})
    w.on('message', (msg: WorkerResponse) => {
      const p = this.pending.get(msg.reqId)
      if (!p) return
      if (msg.type === 'progress') return p.onProgress?.(msg.done)
      this.pending.delete(msg.reqId)
      if (msg.type === 'error') p.reject(new Error(msg.error))
      else p.resolve(msg)
    })
    w.on('error', (e) => {
      log.error('scan worker crashed', e)
      const err = e instanceof Error ? e : new Error(String(e))
      // Fail everything outstanding; a fresh worker is spawned lazily.
      for (const [id, p] of this.pending) {
        p.reject(err)
        this.pending.delete(id)
      }
      this.workers = this.workers.filter((x) => x !== w)
    })
    return w
  }

  private send(req: RequestBody, onProgress?: (done: number) => void): Promise<WorkerResponse> {
    this.ensure()
    if (!this.workers.length) this.workers.push(this.spawn())
    const reqId = this.nextId++
    const worker = this.workers[this.rr++ % this.workers.length]
    return new Promise((resolve, reject) => {
      this.pending.set(reqId, { resolve, reject, onProgress })
      worker.postMessage({ ...req, reqId })
    })
  }

  /** Parse files across all workers. onProgress reports the total number of files done. */
  async parse(
    jobs: ParseJob[],
    onProgress?: (done: number, total: number, current?: string) => void
  ): Promise<{ faces: FaceInfo[]; broken: BrokenFont[] }> {
    this.ensure()
    if (!jobs.length) return { faces: [], broken: [] }
    // Interleave so huge CJK files don't all land on one worker.
    const sorted = [...jobs].sort((a, b) => b.size - a.size)
    const buckets: ParseJob[][] = Array.from({ length: this.workers.length }, () => [])
    sorted.forEach((j, i) => buckets[i % buckets.length].push(j))
    const doneBy = new Array(buckets.length).fill(0)
    const results = await Promise.all(
      buckets
        .filter((b) => b.length)
        .map((bucket, bi) =>
          this.send({ type: 'parse', jobs: bucket }, (done) => {
            doneBy[bi] = done
            onProgress?.(
              doneBy.reduce((a, b) => a + b, 0),
              jobs.length
            )
          })
        )
    )
    const faces: FaceInfo[] = []
    const broken: BrokenFont[] = []
    for (const r of results) {
      if (r.type === 'parsed') {
        faces.push(...r.faces)
        broken.push(...r.broken)
      }
    }
    return { faces, broken }
  }

  async glyphs(path: string, index: number): Promise<GlyphInfo[]> {
    const r = await this.send({ type: 'glyphs', path, index })
    return r.type === 'glyphs' ? r.glyphs : []
  }

  async validate(paths: string[]): Promise<{ path: string; error: string }[]> {
    const r = await this.send({ type: 'validate', paths })
    return r.type === 'validated' ? r.errors : paths.map((p) => ({ path: p, error: 'validation failed' }))
  }

  dispose(): void {
    for (const w of this.workers) void w.terminate()
    this.workers = []
  }
}

export const scanPool = new ScanPool()
