import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CatalogFamily } from '@shared/types'

const TTL = 12 * 60 * 60 * 1000

function file(name: string): string {
  const dir = join(app.getPath('userData'), 'cache')
  mkdirSync(dir, { recursive: true })
  return join(dir, `${name}-catalog.json`)
}

export function readCatalogCache(name: string, allowStale = false): CatalogFamily[] | null {
  try {
    const f = file(name)
    if (!existsSync(f)) return null
    const { fetchedAt, families } = JSON.parse(readFileSync(f, 'utf8'))
    if (!allowStale && Date.now() - fetchedAt > TTL) return null
    return families
  } catch {
    return null
  }
}

export function writeCatalogCache(name: string, families: CatalogFamily[]): void {
  const f = file(name)
  writeFileSync(f + '.tmp', JSON.stringify({ fetchedAt: Date.now(), families }))
  renameSync(f + '.tmp', f)
}

/** Fetch-through cache: fresh cache → network → stale cache fallback when offline. */
export async function cachedCatalog(
  name: string,
  force: boolean,
  fetcher: () => Promise<CatalogFamily[]>
): Promise<CatalogFamily[]> {
  if (!force) {
    const fresh = readCatalogCache(name)
    if (fresh) return fresh
  }
  try {
    const families = await fetcher()
    writeCatalogCache(name, families)
    return families
  } catch (e) {
    const stale = readCatalogCache(name, true)
    if (stale) return stale
    throw e
  }
}
