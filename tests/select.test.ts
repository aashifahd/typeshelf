import { describe, expect, it } from 'vitest'
import {
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
