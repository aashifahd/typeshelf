import { describe, expect, it } from 'vitest'
import {
  expandVariableVariants,
  googleApiDownloads,
  googleAxisName,
  normalizeGoogleVariant,
  googlePreviewVariant,
  isNewerVersion,
  mapFontshareCategory,
  mapGoogleCategory,
  selectFontshareEntries,
  selectGoogleFiles
} from '../src/main/providers/select'

const INTER = [
  'static/Inter_18pt-Regular.ttf',
  'static/Inter_18pt-Bold.ttf',
  'static/Inter_18pt-Italic.ttf',
  'Inter-VariableFont_opsz,wght.ttf',
  'Inter-Italic-VariableFont_opsz,wght.ttf',
  'OFL.txt'
]

const SATOSHI = [
  'Satoshi_Complete/Fonts/TTF/Satoshi-VariableItalic.ttf',
  'Satoshi_Complete/Fonts/TTF/Satoshi-Variable.ttf',
  'Satoshi_Complete/Fonts/OTF/Satoshi-Bold.otf',
  'Satoshi_Complete/Fonts/OTF/Satoshi-Regular.otf',
  'Satoshi_Complete/Fonts/WEB/fonts/Satoshi-Regular.ttf',
  'Satoshi_Complete/Fonts/WEB/fonts/Satoshi-Variable.ttf',
  'Satoshi_Complete/License/FFL.txt'
]

describe('selectGoogleFiles', () => {
  it('prefers variable files when asked', () => {
    expect(selectGoogleFiles(INTER, true)).toEqual({
      files: ['Inter-VariableFont_opsz,wght.ttf', 'Inter-Italic-VariableFont_opsz,wght.ttf'],
      variable: true
    })
  })
  it('falls back to static/ files', () => {
    const r = selectGoogleFiles(INTER, false)
    expect(r.variable).toBe(false)
    expect(r.files.every((f) => f.startsWith('static/'))).toBe(true)
  })
  it('handles static-only families with top-level files', () => {
    expect(selectGoogleFiles(['BebasNeue-Regular.ttf', 'OFL.txt'], true)).toEqual({ files: ['BebasNeue-Regular.ttf'], variable: false })
  })
  it('uses variable files when no static ones exist even if static preferred', () => {
    expect(selectGoogleFiles(['Foo[wght].ttf'], false)).toEqual({ files: ['Foo[wght].ttf'], variable: true })
  })
})

describe('selectFontshareEntries', () => {
  it('never installs WEB files and prefers variable TTF when asked', () => {
    const r = selectFontshareEntries(SATOSHI, true)
    expect(r.variable).toBe(true)
    expect(r.files).toEqual(['Satoshi_Complete/Fonts/TTF/Satoshi-VariableItalic.ttf', 'Satoshi_Complete/Fonts/TTF/Satoshi-Variable.ttf'])
  })
  it('uses static OTFs otherwise', () => {
    const r = selectFontshareEntries(SATOSHI, false)
    expect(r.variable).toBe(false)
    expect(r.files).toEqual(['Satoshi_Complete/Fonts/OTF/Satoshi-Bold.otf', 'Satoshi_Complete/Fonts/OTF/Satoshi-Regular.otf'])
  })
  it('ignores macOS metadata entries', () => {
    expect(selectFontshareEntries(['__MACOSX/Fonts/OTF/._A.otf', 'X/Fonts/OTF/A.otf'], false).files).toEqual(['X/Fonts/OTF/A.otf'])
  })
})

describe('isNewerVersion', () => {
  it('compares ISO dates (Google)', () => {
    expect(isNewerVersion('2025-09-10', '2025-03-01')).toBe(true)
    expect(isNewerVersion('2025-03-01', '2025-09-10')).toBe(false)
    expect(isNewerVersion('2025-03-01', '2025-03-01')).toBe(false)
  })
  it('compares dotted versions (Fontshare)', () => {
    expect(isNewerVersion('1.010', '1.002')).toBe(true)
    expect(isNewerVersion('2.0', '1.9.9')).toBe(true)
    expect(isNewerVersion('1.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('1.001', '1.1')).toBe(false)
  })
  it('treats a missing local version as outdated and empty remote as not newer', () => {
    expect(isNewerVersion('1.0', '')).toBe(true)
    expect(isNewerVersion('', '1.0')).toBe(false)
  })
})

describe('category + preview helpers', () => {
  it('maps provider categories', () => {
    expect(mapGoogleCategory('Sans Serif')).toBe('sans-serif')
    expect(mapGoogleCategory('Handwriting')).toBe('handwriting')
    expect(mapFontshareCategory('Serif,  Blackletter, Display')).toBe('serif')
    expect(mapFontshareCategory('Slab')).toBe('serif')
    expect(mapFontshareCategory('Handwritten')).toBe('handwriting')
    expect(mapFontshareCategory('Sans')).toBe('sans-serif')
  })
  it('picks 400 or the nearest upright weight', () => {
    expect(googlePreviewVariant(['300', '400', '700'])).toEqual({ weight: 400, italic: false })
    expect(googlePreviewVariant(['300', '300i'])).toEqual({ weight: 300, italic: false })
    expect(googlePreviewVariant(['400i'])).toEqual({ weight: 400, italic: true })
  })
})

describe('Google Fonts Developer API helpers', () => {
  const G = 'https://fonts.gstatic.com/s/lora/v35/'

  it('normalizes API variant names', () => {
    expect(['regular', 'italic', '700', '700italic', '100'].map(normalizeGoogleVariant)).toEqual(['400', '400i', '700', '700i', '100'])
    expect(mapGoogleCategory('sans-serif')).toBe('sans-serif')
    expect(googleAxisName('wght')).toBe('Weight')
    expect(googleAxisName('ABCD')).toBe('ABCD')
  })

  it('names static files readably', () => {
    const d = googleApiDownloads(
      'Lora',
      { regular: G + 'a.ttf', italic: G + 'b.ttf', '700': G + 'c.ttf', '700italic': G + 'd.ttf' },
      []
    )
    expect(d.map((x) => x.filename).sort()).toEqual(['Lora-Bold.ttf', 'Lora-BoldItalic.ttf', 'Lora-Italic.ttf', 'Lora-Regular.ttf'])
  })

  it('downloads a shared variable file once and names it with its axes', () => {
    const d = googleApiDownloads(
      'Open Sans',
      { regular: G + 'v.ttf', '700': G + 'v.ttf', italic: G + 'vi.ttf', '700italic': G + 'vi.ttf' },
      ['wdth', 'wght']
    )
    expect(d).toEqual([
      { url: G + 'v.ttf', filename: 'OpenSans[wdth,wght].ttf' },
      { url: G + 'vi.ttf', filename: 'OpenSans-Italic[wdth,wght].ttf' }
    ])
  })

  it('treats many distinct files as statics even when axes are known', () => {
    const files = { '300': G + '1.ttf', regular: G + '2.ttf', '700': G + '3.ttf' }
    expect(googleApiDownloads('Lora', files, ['wght']).map((x) => x.filename).sort()).toEqual(['Lora-Bold.ttf', 'Lora-Light.ttf', 'Lora-Regular.ttf'])
  })

  it('skips non-font files', () => {
    expect(googleApiDownloads('X', { regular: G + 'a.woff2' }, [])).toEqual([])
  })
})

describe('expandVariableVariants', () => {
  it('lists the named weights a variable family covers', () => {
    expect(expandVariableVariants(['400', '400i'], [{ tag: 'wght', start: 400, end: 700 }])).toEqual([
      '400', '400i', '500', '500i', '600', '600i', '700', '700i'
    ])
    expect(expandVariableVariants(['400'], [{ tag: 'wght', start: 100, end: 900 }])).toHaveLength(9)
  })
  it('leaves families without a weight axis alone', () => {
    expect(expandVariableVariants(['400'], [{ tag: 'wdth', start: 75, end: 100 }])).toEqual(['400'])
    expect(expandVariableVariants(['400', '700'], [])).toEqual(['400', '700'])
  })
})
