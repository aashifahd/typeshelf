// Pure helpers shared by the renderer and tests.
import type { ActivationRecord, Category, FaceInfo, Script, Source } from './types'

export interface Family {
  name: string
  faces: FaceInfo[]
  /** Face shown in list previews (closest to Regular). */
  primary: FaceInfo
  category: Category
  variable: boolean
  monospace: boolean
  scripts: Script[]
  sourceIds: string[]
  designer?: string
  manufacturer?: string
  newest: number
}

export type ActiveState = 'installed' | 'on' | 'off' | 'partial' | 'web-only'

const WIDTH_NORMAL = 5

/** Sort faces like a type specimen: upright before italic, light to heavy, normal width first. */
export function compareFaces(a: FaceInfo, b: FaceInfo): number {
  return (
    Math.abs(a.width - WIDTH_NORMAL) - Math.abs(b.width - WIDTH_NORMAL) ||
    a.weight - b.weight ||
    Number(a.italic) - Number(b.italic) ||
    a.style.localeCompare(b.style)
  )
}

export function pickPrimary(faces: FaceInfo[]): FaceInfo {
  return faces.reduce((best, f) => {
    const score = (x: FaceInfo): number =>
      (x.italic ? 1000 : 0) + Math.abs(x.weight - 400) + Math.abs(x.width - WIDTH_NORMAL) * 50 + (/regular|book|roman/i.test(x.style) ? -5 : 0)
    return score(f) < score(best) ? f : best
  }, faces[0])
}

export function groupFamilies(faces: FaceInfo[]): Family[] {
  const map = new Map<string, FaceInfo[]>()
  for (const f of faces) {
    const key = f.family
    const list = map.get(key)
    if (list) list.push(f)
    else map.set(key, [f])
  }
  const families: Family[] = []
  for (const [name, list] of map) {
    // De-duplicate identical faces that exist in several sources (keep first).
    const seen = new Set<string>()
    const unique = list.filter((f) => {
      const k = `${f.postscriptName || f.fullName}|${f.sourceId}|${f.path}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    unique.sort(compareFaces)
    const primary = pickPrimary(unique)
    const scripts = new Set<Script>()
    unique.forEach((f) => f.scripts.forEach((s) => scripts.add(s)))
    families.push({
      name,
      faces: unique,
      primary,
      category: primary.category,
      variable: unique.some((f) => f.variable),
      monospace: unique.some((f) => f.monospace),
      scripts: [...scripts],
      sourceIds: [...new Set(unique.map((f) => f.sourceId))],
      designer: unique.find((f) => f.designer)?.designer,
      manufacturer: unique.find((f) => f.manufacturer)?.manufacturer,
      newest: Math.max(...unique.map((f) => f.mtime))
    })
  }
  return families.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export function familyState(
  fam: Family,
  sources: Map<string, Source>,
  activations: Record<string, ActivationRecord>,
  external: Set<string>
): ActiveState {
  const togglable = fam.faces.filter((f) => !sources.get(f.sourceId)?.readonly)
  if (!togglable.length) return 'installed'
  const installable = togglable.filter((f) => f.format !== 'woff' && f.format !== 'woff2')
  if (!installable.length) return 'web-only'
  const on = installable.filter((f) => activations[f.path.toLowerCase()] || external.has(f.path.toLowerCase())).length
  if (on === 0) return 'off'
  if (on === installable.length) return 'on'
  return 'partial'
}

export function faceActive(
  f: FaceInfo,
  sources: Map<string, Source>,
  activations: Record<string, ActivationRecord>,
  external: Set<string>
): boolean {
  if (sources.get(f.sourceId)?.readonly) return true
  const k = f.path.toLowerCase()
  return Boolean(activations[k]) || external.has(k)
}

export interface FamilyFilter {
  query: string
  categories: Category[]
  variableOnly: boolean
  monospaceOnly: boolean
  script: Script | ''
}

export function matchesFilter(f: Family, filter: FamilyFilter): boolean {
  if (filter.categories.length && !filter.categories.includes(f.category)) return false
  if (filter.variableOnly && !f.variable) return false
  if (filter.monospaceOnly && !f.monospace) return false
  if (filter.script && !f.scripts.includes(filter.script)) return false
  const q = filter.query.trim().toLowerCase()
  if (q) {
    const hay = `${f.name} ${f.designer ?? ''} ${f.manufacturer ?? ''} ${f.faces.map((x) => x.postscriptName).join(' ')}`.toLowerCase()
    return q.split(/\s+/).every((t) => hay.includes(t))
  }
  return true
}

/**
 * How well a family's *name* matches a search (lower is better), so families
 * named after the query come before ones that only match on designer or
 * PostScript names: 0 name starts with the query, 1 name contains it,
 * 2 name contains every word, 3 matched elsewhere.
 */
export function searchRank(name: string, query: string): number {
  const q = query.trim().toLowerCase()
  const n = name.toLowerCase()
  if (!q) return 0
  if (n.startsWith(q)) return 0
  if (n.includes(q)) return 1
  if (q.split(/\s+/).every((t) => n.includes(t))) return 2
  return 3
}

/** Faces whose PostScript name appears in more than one file (conflicts / duplicates). */
export function findDuplicates(faces: FaceInfo[]): FaceInfo[][] {
  const map = new Map<string, FaceInfo[]>()
  for (const f of faces) {
    if (!f.postscriptName) continue
    const k = f.postscriptName.toLowerCase()
    const list = map.get(k)
    if (list) list.push(f)
    else map.set(k, [f])
  }
  return [...map.values()]
    .filter((list) => new Set(list.map((f) => f.path.toLowerCase())).size > 1)
    .sort((a, b) => a[0].postscriptName.localeCompare(b[0].postscriptName))
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function weightName(w: number): string {
  const names: [number, string][] = [
    [100, 'Thin'],
    [200, 'ExtraLight'],
    [300, 'Light'],
    [400, 'Regular'],
    [500, 'Medium'],
    [600, 'SemiBold'],
    [700, 'Bold'],
    [800, 'ExtraBold'],
    [900, 'Black']
  ]
  return names.reduce((best, n) => (Math.abs(n[0] - w) < Math.abs(best[0] - w) ? n : best))[1]
}
