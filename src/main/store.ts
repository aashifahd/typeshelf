import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import log from './log'

/**
 * Tiny JSON document store with atomic writes (write temp file, then rename)
 * and debounced persistence, so a crash mid-write never corrupts state.
 */
export class JsonStore<T extends object> {
  private data: T
  private timer: NodeJS.Timeout | null = null
  readonly file: string

  constructor(name: string, private defaults: T) {
    this.file = join(app.getPath('userData'), `${name}.json`)
    this.data = this.load()
  }

  private load(): T {
    try {
      if (existsSync(this.file)) {
        const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
        return { ...structuredClone(this.defaults), ...parsed }
      }
    } catch (e) {
      log.error(`store ${this.file} unreadable, backing up and resetting`, e)
      try {
        renameSync(this.file, `${this.file}.corrupt-${Date.now()}`)
      } catch {
        /* ignore */
      }
    }
    return structuredClone(this.defaults)
  }

  get(): T {
    return this.data
  }

  set(next: T): void {
    this.data = next
    this.scheduleSave()
  }

  update(fn: (d: T) => void): T {
    fn(this.data)
    this.scheduleSave()
    return this.data
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 300)
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data))
      renameSync(tmp, this.file)
    } catch (e) {
      log.error(`failed to persist ${this.file}`, e)
    }
  }
}
