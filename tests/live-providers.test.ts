// Live checks against the real provider APIs. Run with: LIVE=1 npm test
import * as fontkit from 'fontkit'
import AdmZip from 'adm-zip'
import { describe, expect, it } from 'vitest'
import { googleApiDownloads, normalizeGoogleVariant, selectFontshareEntries, selectGoogleFiles } from '../src/main/providers/select'

const KEY = process.env.GOOGLE_FONTS_API_KEY ?? ''
const liveApi = process.env.LIVE && KEY ? it : it.skip

const live = process.env.LIVE ? it : it.skip

describe('live providers', () => {
  live(
    'Google Fonts: metadata has versions and a family downloads + parses',
    async () => {
      const meta = JSON.parse((await (await fetch('https://fonts.google.com/metadata/fonts')).text()).replace(/^\)\]\}'\s*/, ''))
      const lora = meta.familyMetadataList.find((f: { family: string }) => f.family === 'Lora')
      expect(lora.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/)

      const list = JSON.parse((await (await fetch('https://fonts.google.com/download/list?family=Lora')).text()).replace(/^\)\]\}'\s*/, ''))
      const refs: { filename: string; url: string }[] = list.manifest.fileRefs
      const sel = selectGoogleFiles(
        refs.map((r) => r.filename),
        true
      )
      expect(sel.variable).toBe(true)
      const url = refs.find((r) => r.filename === sel.files[0])!.url
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const font: any = fontkit.create(buf)
      expect(font.familyName).toBe('Lora')
      expect(Object.keys(font.variationAxes)).toContain('wght')
    },
    60_000
  )

  live(
    'Fontshare: catalog has versions and the zip yields installable fonts',
    async () => {
      const page = await (await fetch('https://api.fontshare.com/v2/fonts?offset=0&limit=100')).json()
      const satoshi = page.fonts.find((f: { slug: string }) => f.slug === 'satoshi')
      expect(satoshi?.version).toBeTruthy()
      const zip = new AdmZip(Buffer.from(await (await fetch('https://api.fontshare.com/v2/fonts/download/satoshi')).arrayBuffer()))
      const entries = zip.getEntries().map((e) => e.entryName)
      const sel = selectFontshareEntries(entries, false)
      expect(sel.files.length).toBeGreaterThan(3)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const font: any = fontkit.create(zip.getEntry(sel.files[0])!.getData())
      expect(font.familyName).toMatch(/Satoshi/)
    },
    60_000
  )

  liveApi(
    'Google Fonts Developer API: catalogue fields and variable/static downloads',
    async () => {
      const api = 'https://www.googleapis.com/webfonts/v1/webfonts'
      const list = async (qs: string) => (await (await fetch(`${api}?key=${KEY}&${qs}`)).json()).items as any[]
      const catalog = await list('sort=popularity&capability=VF')
      expect(catalog.length).toBeGreaterThan(1000)
      const lora = catalog.find((f) => f.family === 'Lora')
      expect(lora.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(lora.axes.map((a: { tag: string }) => a.tag)).toContain('wght')
      expect(lora.variants.map(normalizeGoogleVariant)).toContain('400')

      const vf = (await list('family=Lora&capability=VF'))[0]
      const vfFiles = googleApiDownloads('Lora', vf.files, vf.axes.map((a: { tag: string }) => a.tag))
      expect(vfFiles.every((d) => d.filename.includes('[wght]'))).toBe(true)
      const vfFont: any = fontkit.create(Buffer.from(await (await fetch(vfFiles[0].url)).arrayBuffer()))
      expect(Object.keys(vfFont.variationAxes)).toContain('wght')

      const st = (await list('family=Lora'))[0]
      const stFiles = googleApiDownloads('Lora', st.files, [])
      expect(stFiles.map((d) => d.filename)).toContain('Lora-Bold.ttf')
      const stFont: any = fontkit.create(Buffer.from(await (await fetch(stFiles[0].url)).arrayBuffer()))
      expect(stFont.familyName).toBe('Lora')
    },
    60_000
  )
})
