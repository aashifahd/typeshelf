import { describe, expect, it } from 'vitest'
import { familyState, findDuplicates, groupFamilies, matchesFilter, pickPrimary } from '../src/shared/families'
import type { FaceInfo, Source } from '../src/shared/types'

let n = 0
function face(p: Partial<FaceInfo>): FaceInfo {
  n++
  return {
    id: `id${n}`,
    sourceId: 'lib',
    path: `D:\\fonts\\f${n}.ttf`,
    index: 0,
    format: 'ttf',
    family: 'Test Sans',
    style: 'Regular',
    fullName: 'Test Sans',
    postscriptName: `TestSans-${n}`,
    weight: 400,
    width: 5,
    italic: false,
    monospace: false,
    category: 'sans-serif',
    variable: false,
    axes: [],
    instances: [],
    features: [],
    scripts: ['latin'],
    version: '1.0',
    glyphCount: 100,
    unitsPerEm: 1000,
    size: 1000,
    mtime: n,
    ...p
  }
}

const sources = new Map<string, Source>([
  ['lib', { id: 'lib', kind: 'folder', name: 'Lib', path: 'D:\\fonts', readonly: false, watch: true }],
  ['system', { id: 'system', kind: 'system', name: 'Windows', path: 'C:\\Windows\\Fonts', readonly: true, watch: false }]
])

describe('groupFamilies', () => {
  it('groups by family and sorts faces like a specimen', () => {
    const fams = groupFamilies([
      face({ style: 'Bold Italic', weight: 700, italic: true }),
      face({ style: 'Bold', weight: 700 }),
      face({ style: 'Light', weight: 300 }),
      face({ style: 'Regular', weight: 400 }),
      face({ family: 'Alpha Serif', category: 'serif' })
    ])
    expect(fams.map((f) => f.name)).toEqual(['Alpha Serif', 'Test Sans'])
    expect(fams[1].faces.map((f) => f.style)).toEqual(['Light', 'Regular', 'Bold', 'Bold Italic'])
    expect(fams[1].primary.style).toBe('Regular')
  })

  it('picks an upright face near 400 as primary', () => {
    const p = pickPrimary([face({ style: 'Italic', italic: true }), face({ style: 'Medium', weight: 500 }), face({ style: 'Black', weight: 900 })])
    expect(p.style).toBe('Medium')
  })
})

describe('familyState', () => {
  it('reports installed, on, off and partial', () => {
    const a = face({ family: 'A' })
    const b = face({ family: 'A', style: 'Bold', weight: 700 })
    const sys = face({ family: 'S', sourceId: 'system' })
    const web = face({ family: 'W', format: 'woff2' })
    const [famA, famS, famW] = groupFamilies([a, b, sys, web])
    const ext = new Set<string>()
    expect(familyState(famA, sources, {}, ext)).toBe('off')
    expect(familyState(famA, sources, { [a.path.toLowerCase()]: { path: a.path, mode: 'permanent', activatedAt: 0 } }, ext)).toBe('partial')
    expect(
      familyState(
        famA,
        sources,
        {
          [a.path.toLowerCase()]: { path: a.path, mode: 'permanent', activatedAt: 0 },
          [b.path.toLowerCase()]: { path: b.path, mode: 'session', activatedAt: 0 }
        },
        ext
      )
    ).toBe('on')
    expect(familyState(famS, sources, {}, ext)).toBe('installed')
    expect(familyState(famW, sources, {}, ext)).toBe('web-only')
  })
  it('counts fonts registered by other apps as on', () => {
    const a = face({ family: 'Ext' })
    const [fam] = groupFamilies([a])
    expect(familyState(fam, sources, {}, new Set([a.path.toLowerCase()]))).toBe('on')
  })
})

describe('filters & duplicates', () => {
  it('matches multi-word queries against name, designer and postscript names', () => {
    const [fam] = groupFamilies([face({ family: 'Inter', designer: 'Rasmus Andersson', postscriptName: 'Inter-Regular' })])
    const base = { categories: [], variableOnly: false, monospaceOnly: false, script: '' as const }
    expect(matchesFilter(fam, { ...base, query: 'rasmus inter' })).toBe(true)
    expect(matchesFilter(fam, { ...base, query: 'roboto' })).toBe(false)
    expect(matchesFilter(fam, { ...base, query: '', categories: ['serif'] })).toBe(false)
    expect(matchesFilter(fam, { ...base, query: '', script: 'cyrillic' })).toBe(false)
  })
  it('finds the same PostScript name in different files only', () => {
    const d = findDuplicates([
      face({ postscriptName: 'Dup-Regular', path: 'D:\\a.ttf' }),
      face({ postscriptName: 'Dup-Regular', path: 'E:\\b.ttf' }),
      face({ postscriptName: 'Coll-Regular', path: 'D:\\c.ttc', index: 0 }),
      face({ postscriptName: 'Coll-Regular', path: 'D:\\c.ttc', index: 1 })
    ])
    expect(d).toHaveLength(1)
    expect(d[0][0].postscriptName).toBe('Dup-Regular')
  })
})
