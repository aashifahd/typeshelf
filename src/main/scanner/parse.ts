import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import type { Axis, Category, FaceInfo, Script } from '@shared/types'

/** File extensions we index. */
export const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc', '.woff', '.woff2'])

export function isFontFile(p: string): boolean {
  return FONT_EXTENSIONS.has(extname(p).toLowerCase())
}

export function faceId(path: string, index: number): string {
  return createHash('sha1').update(`${path.toLowerCase()}#${index}`).digest('hex').slice(0, 16)
}

/** Never let one malformed table take down a whole scan. */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn()
    return v === undefined || v === null ? fallback : v
  } catch {
    return fallback
  }
}

function pickName(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'object') {
    const rec = value as Record<string, string>
    const v = rec.en ?? rec['en-US'] ?? Object.values(rec)[0]
    return typeof v === 'string' ? v.trim() || undefined : undefined
  }
  return undefined
}

// Sample code points used to detect script coverage.
const SCRIPT_PROBES: [Script, number[]][] = [
  ['latin', [0x41, 0x61, 0x5a]],
  ['latin-ext', [0x104, 0x150, 0x219]],
  ['cyrillic', [0x414, 0x436]],
  ['greek', [0x3a9, 0x3b1]],
  ['arabic', [0x627, 0x628]],
  ['hebrew', [0x5d0, 0x5d1]],
  ['devanagari', [0x915, 0x92e]],
  ['tamil', [0xb95, 0xbae]],
  ['sinhala', [0xd9a, 0xdc3]],
  ['thai', [0xe01, 0xe02]],
  ['cjk', [0x4e00, 0x4e2d]],
  ['japanese', [0x3042, 0x30a2]],
  ['korean', [0xac00, 0xd55c]]
]

const CATEGORY_NAME_HINTS: [RegExp, Category][] = [
  [/\b(mono|code|console|courier|terminal|typewriter)\b/i, 'monospace'],
  [/\b(script|hand|brush|marker|signature|calligraph)/i, 'handwriting'],
  [/\b(symbol|icons?|dingbats?|emoji|wingdings|webdings|marlett)\b/i, 'symbol'],
  [/\bslab\b/i, 'serif'],
  [/\bsans\b/i, 'sans-serif'],
  [/\bserif\b/i, 'serif'],
  [/\b(display|poster|headline|stencil|decor)/i, 'display']
]

export interface ClassifyInput {
  family: string
  familyClass: number
  panose: number[]
  fixedPitch: boolean
}

/** Classify using OS/2 sFamilyClass + PANOSE, falling back to name heuristics. */
export function classify({ family, familyClass, panose, fixedPitch }: ClassifyInput): {
  category: Category
  monospace: boolean
} {
  const monospace = fixedPitch || (panose[0] === 2 && panose[3] === 9)
  if (monospace) return { category: 'monospace', monospace: true }

  for (const [re, cat] of CATEGORY_NAME_HINTS) {
    if (re.test(family)) return { category: cat, monospace: cat === 'monospace' }
  }

  const cls = (familyClass >> 8) & 0xff
  if ([1, 2, 3, 4, 5, 7].includes(cls)) return { category: 'serif', monospace: false }
  if (cls === 8) return { category: 'sans-serif', monospace: false }
  if (cls === 9) return { category: 'display', monospace: false }
  if (cls === 10) return { category: 'handwriting', monospace: false }
  if (cls === 12) return { category: 'symbol', monospace: false }

  const [familyType, serifStyle] = panose
  if (familyType === 3) return { category: 'handwriting', monospace: false }
  if (familyType === 4) return { category: 'display', monospace: false }
  if (familyType === 5) return { category: 'symbol', monospace: false }
  if (familyType === 2) {
    if (serifStyle >= 11 && serifStyle <= 13) return { category: 'sans-serif', monospace: false }
    if (serifStyle >= 2 && serifStyle <= 10) return { category: 'serif', monospace: false }
    if (serifStyle === 14 || serifStyle === 15) return { category: 'sans-serif', monospace: false }
  }
  return { category: 'other', monospace: false }
}

export function formatFromPath(path: string, isCollection: boolean, isCff: boolean): FaceInfo['format'] {
  const ext = extname(path).toLowerCase().slice(1)
  if (ext === 'woff' || ext === 'woff2') return ext
  if (isCollection) return ext === 'otc' ? 'otc' : 'ttc'
  return isCff ? 'otf' : ext === 'otf' ? 'otf' : 'ttf'
}

// Minimal structural type for the parts of a fontkit Font we read.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FkFont = any

export function describeFace(
  font: FkFont,
  opts: { path: string; index: number; sourceId: string; size: number; mtime: number; isCollection: boolean }
): FaceInfo {
  const name = (key: string): string | undefined => safe(() => pickName(font.getName(key, 'en')), undefined)

  const family = name('preferredFamily') ?? name('fontFamily') ?? safe(() => font.familyName, '') ?? ''
  const style = name('preferredSubfamily') ?? name('fontSubfamily') ?? safe(() => font.subfamilyName, 'Regular')
  const os2 = safe(() => font['OS/2'], null) as Record<string, unknown> | null
  const weight = Number(os2?.usWeightClass ?? 400) || 400
  const width = Number(os2?.usWidthClass ?? 5) || 5
  const fsSelection = (os2?.fsSelection ?? {}) as Record<string, boolean>
  const italic = Boolean(fsSelection.italic) || /italic|oblique/i.test(style)
  const panose = (safe(() => Array.from(os2?.panose as number[]), []) as number[]) ?? []
  const fixedPitch = safe(() => Boolean(font.post?.isFixedPitch), false)
  const { category, monospace } = classify({
    family,
    familyClass: Number(os2?.sFamilyClass ?? 0),
    panose,
    fixedPitch
  })

  const rawAxes = safe(() => font.variationAxes as Record<string, { name: string; min: number; default: number; max: number }>, {})
  const axes: Axis[] = Object.entries(rawAxes).map(([tag, a]) => ({
    tag,
    name: pickName(a.name) ?? tag,
    min: a.min,
    default: a.default,
    max: a.max
  }))

  // fontkit's namedVariations getter throws for instances without an English name.
  const instances = safe(
    () =>
      ((font.fvar?.instance ?? []) as { name: unknown }[])
        .map((i) => pickName(i.name))
        .filter((n): n is string => Boolean(n)),
    [] as string[]
  )

  const scripts = SCRIPT_PROBES.filter(([, cps]) =>
    safe(() => cps.every((cp) => font.hasGlyphForCodePoint(cp)), false)
  ).map(([s]) => s)

  const features = safe(() => Array.from(new Set(font.availableFeatures as string[])).sort(), [] as string[])
  const isCff = safe(() => Boolean(font.directory?.tables?.['CFF '] || font.directory?.tables?.CFF2), false)

  return {
    id: faceId(opts.path, opts.index),
    sourceId: opts.sourceId,
    path: opts.path,
    index: opts.index,
    format: formatFromPath(opts.path, opts.isCollection, isCff),
    family: family || name('fullName') || opts.path.split(/[\\/]/).pop() || 'Unknown',
    style: style || 'Regular',
    fullName: name('fullName') ?? `${family} ${style}`.trim(),
    postscriptName: safe(() => font.postscriptName as string, '') || name('postscriptName') || '',
    weight,
    width,
    italic,
    monospace,
    category,
    variable: axes.length > 0,
    axes,
    instances,
    features,
    scripts,
    version: (name('version') ?? '').replace(/^version\s*/i, ''),
    designer: name('designer'),
    designerUrl: name('designerURL'),
    manufacturer: name('manufacturer'),
    vendorUrl: name('vendorURL'),
    license: name('license'),
    licenseUrl: name('licenseURL'),
    copyright: name('copyright'),
    description: name('description'),
    glyphCount: safe(() => font.numGlyphs as number, 0),
    unitsPerEm: safe(() => font.unitsPerEm as number, 1000),
    size: opts.size,
    mtime: opts.mtime
  }
}
