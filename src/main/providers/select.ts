// Pure helpers (no Electron imports) so they can be unit tested.
import type { Category } from '@shared/types'

const FONT_RE = /\.(ttf|otf)$/i

/**
 * Choose which files of a Google Fonts family to install.
 * Google ships variable fonts at the top level and static instances in `static/`.
 */
export function selectGoogleFiles(filenames: string[], preferVariable: boolean): { files: string[]; variable: boolean } {
  const fonts = filenames.filter((f) => FONT_RE.test(f))
  const variable = fonts.filter((f) => !f.startsWith('static/') && /VariableFont|\[.+\]/.test(f))
  const statics = fonts.filter((f) => f.startsWith('static/'))
  const topLevelStatic = fonts.filter((f) => !f.includes('/') && !variable.includes(f))
  if (preferVariable && variable.length) return { files: variable, variable: true }
  if (statics.length) return { files: statics, variable: false }
  if (topLevelStatic.length) return { files: topLevelStatic, variable: false }
  return { files: variable, variable: variable.length > 0 }
}

/**
 * Choose which entries of a Fontshare zip to install. Fontshare zips contain
 * Fonts/TTF (often variable), Fonts/OTF (static) and Fonts/WEB (never installed).
 */
export function selectFontshareEntries(entries: string[], preferVariable: boolean): { files: string[]; variable: boolean } {
  const fonts = entries.filter((e) => FONT_RE.test(e) && !/\/WEB\//i.test(e) && !e.startsWith('__MACOSX'))
  const isVar = (e: string): boolean => /variable/i.test(e.split('/').pop() ?? '')
  const vars = fonts.filter(isVar)
  const staticOtf = fonts.filter((e) => !isVar(e) && /\.otf$/i.test(e))
  const staticTtf = fonts.filter((e) => !isVar(e) && /\.ttf$/i.test(e))
  if (preferVariable && vars.length) return { files: dedupeByName(vars), variable: true }
  if (staticOtf.length) return { files: dedupeByName(staticOtf), variable: false }
  if (staticTtf.length) return { files: dedupeByName(staticTtf), variable: false }
  return { files: dedupeByName(vars), variable: vars.length > 0 }
}

function dedupeByName(entries: string[]): string[] {
  const seen = new Set<string>()
  return entries.filter((e) => {
    const n = (e.split('/').pop() ?? e).toLowerCase()
    if (seen.has(n)) return false
    seen.add(n)
    return true
  })
}

export function mapGoogleCategory(c: string | undefined): Category {
  switch ((c ?? '').toLowerCase()) {
    case 'sans serif':
    case 'sans-serif':
      return 'sans-serif'
    case 'serif':
      return 'serif'
    case 'display':
      return 'display'
    case 'handwriting':
      return 'handwriting'
    case 'monospace':
      return 'monospace'
    default:
      return 'other'
  }
}

export function mapFontshareCategory(c: string | undefined): Category {
  const first = (c ?? '').split(',')[0].trim().toLowerCase()
  if (first === 'sans') return 'sans-serif'
  if (first === 'serif' || first === 'slab') return 'serif'
  if (first === 'display') return 'display'
  if (first === 'handwritten' || first === 'script') return 'handwriting'
  if (first === 'mono' || first === 'monospace') return 'monospace'
  return 'other'
}

/** Pick the variant used to preview a Google family ("400" if available). */
export function googlePreviewVariant(variants: string[]): { weight: number; italic: boolean } {
  if (variants.includes('400')) return { weight: 400, italic: false }
  const upright = variants.filter((v) => !v.endsWith('i'))
  const pick = (upright.length ? upright : variants).slice().sort(
    (a, b) => Math.abs(parseInt(a) - 400) - Math.abs(parseInt(b) - 400)
  )[0]
  if (!pick) return { weight: 400, italic: false }
  return { weight: parseInt(pick) || 400, italic: pick.endsWith('i') }
}

/** Developer API variant names ("regular", "700italic") → catalogue format ("400", "700i"). */
export function normalizeGoogleVariant(v: string): string {
  if (v === 'regular') return '400'
  if (v === 'italic') return '400i'
  const m = /^(\d{3})(italic)?$/.exec(v)
  return m ? m[1] + (m[2] ? 'i' : '') : v
}

const WEIGHT_NAMES: Record<string, string> = {
  '100': 'Thin',
  '200': 'ExtraLight',
  '300': 'Light',
  '400': 'Regular',
  '500': 'Medium',
  '600': 'SemiBold',
  '700': 'Bold',
  '800': 'ExtraBold',
  '900': 'Black'
}

/**
 * Turn a Developer API `files` map into downloads with readable file names
 * (the API's URLs end in opaque hashes). Duplicate URLs are downloaded once:
 * with `capability=VF` several variants point at the same variable file.
 */
export function googleApiDownloads(
  family: string,
  files: Record<string, string>,
  axisTags: string[]
): { url: string; filename: string }[] {
  const base = family.replace(/[^A-Za-z0-9]+/g, '')
  const byUrl = new Map<string, string[]>()
  for (const [variant, url] of Object.entries(files)) {
    if (!/\.(ttf|otf)$/i.test(new URL(url).pathname)) continue
    byUrl.set(url, [...(byUrl.get(url) ?? []), normalizeGoogleVariant(variant)])
  }
  const shared = [...byUrl.values()].some((vs) => vs.length > 1)
  const out: { url: string; filename: string }[] = []
  for (const [url, variants] of byUrl) {
    const italic = variants.every((v) => v.endsWith('i'))
    const ext = /\.otf$/i.test(url) ? 'otf' : 'ttf'
    if (axisTags.length && (shared || byUrl.size <= 2)) {
      out.push({ url, filename: `${base}${italic ? '-Italic' : ''}[${axisTags.join(',')}].${ext}` })
    } else {
      const v = variants[0]
      const weight = WEIGHT_NAMES[v.replace(/i$/, '')] ?? v.replace(/i$/, '')
      const style = italic ? (weight === 'Regular' ? 'Italic' : `${weight}Italic`) : weight
      out.push({ url, filename: `${base}-${style}.${ext}` })
    }
  }
  return out
}

const AXIS_NAMES: Record<string, string> = {
  wght: 'Weight',
  wdth: 'Width',
  ital: 'Italic',
  slnt: 'Slant',
  opsz: 'Optical size',
  GRAD: 'Grade',
  XHGT: 'x-height',
  CASL: 'Casual',
  MONO: 'Monospace',
  CRSV: 'Cursive',
  SOFT: 'Softness',
  WONK: 'Wonky',
  FILL: 'Fill'
}

export function googleAxisName(tag: string): string {
  return AXIS_NAMES[tag] ?? tag
}

/** Compare provider versions. Google uses ISO dates, Fontshare uses "1.002" style strings. */
export function isNewerVersion(remote: string, local: string): boolean {
  if (!remote || remote === local) return false
  if (!local) return true
  const iso = /^\d{4}-\d{2}-\d{2}/
  if (iso.test(remote) && iso.test(local)) return remote > local
  const pa = remote.split(/[.\-]/).map((n) => parseInt(n, 10) || 0)
  const pb = local.split(/[.\-]/).map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}
