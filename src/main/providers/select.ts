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
