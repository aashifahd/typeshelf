// Integration tests against real font files (Windows only).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as fontkit from 'fontkit'
import { describe, expect, it } from 'vitest'
import { classify, describeFace, isFontFile } from '../src/main/scanner/parse'
import { extractFromCollection } from '../src/main/sfnt'

const WIN_FONTS = join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts')
const onWindows = process.platform === 'win32' && existsSync(WIN_FONTS)
const winIt = onWindows ? it : it.skip

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function openAll(path: string): { fonts: any[]; isCollection: boolean } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f: any = fontkit.create(readFileSync(path))
  return Array.isArray(f.fonts) ? { fonts: f.fonts, isCollection: true } : { fonts: [f], isCollection: false }
}

describe('classify', () => {
  it('uses fixed pitch, family class, panose and name hints', () => {
    expect(classify({ family: 'Anything', familyClass: 0, panose: [], fixedPitch: true }).category).toBe('monospace')
    expect(classify({ family: 'Foo', familyClass: 8 << 8, panose: [], fixedPitch: false }).category).toBe('sans-serif')
    expect(classify({ family: 'Foo', familyClass: 2 << 8, panose: [], fixedPitch: false }).category).toBe('serif')
    expect(classify({ family: 'Foo', familyClass: 0, panose: [3], fixedPitch: false }).category).toBe('handwriting')
    expect(classify({ family: 'Fira Code', familyClass: 0, panose: [], fixedPitch: false }).category).toBe('monospace')
    expect(classify({ family: 'Brush Script', familyClass: 0, panose: [], fixedPitch: false }).category).toBe('handwriting')
  })
})

describe('real Windows fonts', () => {
  winIt('describes Segoe UI', () => {
    const p = join(WIN_FONTS, 'segoeui.ttf')
    const { fonts } = openAll(p)
    const f = describeFace(fonts[0], { path: p, index: 0, sourceId: 'system', size: 1, mtime: 1, isCollection: false })
    expect(f.family).toBe('Segoe UI')
    expect(f.weight).toBe(400)
    expect(f.italic).toBe(false)
    expect(f.category).toBe('sans-serif')
    expect(f.scripts).toEqual(expect.arrayContaining(['latin', 'cyrillic', 'greek']))
    expect(f.features).toContain('smcp')
  })

  winIt('reads variable axes from Bahnschrift without crashing on instances', () => {
    const p = join(WIN_FONTS, 'bahnschrift.ttf')
    if (!existsSync(p)) return
    const { fonts } = openAll(p)
    const f = describeFace(fonts[0], { path: p, index: 0, sourceId: 'system', size: 1, mtime: 1, isCollection: false })
    expect(f.variable).toBe(true)
    expect(f.axes.map((a) => a.tag)).toEqual(expect.arrayContaining(['wght', 'wdth']))
    expect(f.instances.length).toBeGreaterThan(3)
  })

  winIt('extracts a face from a TTC into a standalone font', () => {
    const p = join(WIN_FONTS, 'cambria.ttc')
    if (!existsSync(p)) return
    const out = extractFromCollection(readFileSync(p), 1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f: any = fontkit.create(out)
    expect(Array.isArray(f.fonts)).toBe(false)
    expect(f.postscriptName).toBe('CambriaMath')
    expect(f.numGlyphs).toBeGreaterThan(1000)
    expect(f.glyphForCodePoint(0x41).path.commands.length).toBeGreaterThan(0)
  })

  winIt(
    'parses every installed font without throwing',
    () => {
      const dirs = [WIN_FONTS, join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Windows', 'Fonts')].filter(existsSync)
      let faces = 0
      let files = 0
      const broken: string[] = []
      const t0 = Date.now()
      for (const dir of dirs) {
        for (const name of readdirSync(dir)) {
          if (!isFontFile(name)) continue
          const p = join(dir, name)
          files++
          try {
            const { fonts, isCollection } = openAll(p)
            fonts.forEach((font, index) => {
              const f = describeFace(font, { path: p, index, sourceId: 's', size: statSync(p).size, mtime: 0, isCollection })
              expect(f.family.length).toBeGreaterThan(0)
              faces++
            })
          } catch (e) {
            broken.push(`${name}: ${(e as Error).message}`)
          }
        }
      }
      console.log(`parsed ${faces} faces from ${files} files in ${Date.now() - t0}ms; unreadable: ${broken.length}`)
      if (broken.length) console.log(broken.slice(0, 10).join('\n'))
      expect(faces).toBeGreaterThan(100)
      // A handful of legacy .fon/odd files may fail; the scanner reports them instead of crashing.
      expect(broken.length / files).toBeLessThan(0.05)
    },
    300_000
  )
})
