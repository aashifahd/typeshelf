import { writeFile, mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Axis, CatalogFamily } from '@shared/types'
import { absolutizeCss, getBuffer, getText } from './http'
import { cachedCatalog } from './cache'
import { googlePreviewVariant, mapGoogleCategory, selectGoogleFiles } from './select'
import { safeName, type DownloadedFamily, type Provider } from './types'

const METADATA_URL = 'https://fonts.google.com/metadata/fonts'
const DOWNLOAD_LIST_URL = 'https://fonts.google.com/download/list?family='
const CSS_URL = 'https://fonts.googleapis.com/css2'
// Google picks the font format from the UA; ask for woff2 like a modern browser.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/** Google prefixes JSON responses with an XSSI guard: `)]}'` */
function parseGuarded<T>(text: string): T {
  return JSON.parse(text.replace(/^\)\]\}'\s*/, '')) as T
}

interface GMeta {
  axisRegistry: { tag: string; displayName: string }[]
  familyMetadataList: {
    family: string
    category: string
    designers: string[]
    lastModified: string
    dateAdded: string
    popularity: number
    subsets: string[]
    fonts: Record<string, unknown>
    axes: { tag: string; min: number; max: number; defaultValue: number }[]
    isOpenSource?: boolean
    isBrandFont?: boolean
  }[]
}

interface GDownload {
  zipName: string
  manifest: {
    files: { filename: string; contents: string }[]
    fileRefs: { filename: string; url: string }[]
  }
}

const cssCache = new Map<string, string>()

export const google: Provider = {
  id: 'google',

  catalog(force = false) {
    return cachedCatalog('google', force, async () => {
      const meta = parseGuarded<GMeta>(await getText(METADATA_URL))
      const axisNames = new Map(meta.axisRegistry.map((a) => [a.tag, a.displayName]))
      return meta.familyMetadataList
        .filter((f) => f.isOpenSource !== false && !f.isBrandFont)
        .map((f): CatalogFamily => {
          const variants = Object.keys(f.fonts ?? {})
          const pv = googlePreviewVariant(variants)
          const axes: Axis[] = (f.axes ?? []).map((a) => ({
            tag: a.tag,
            name: axisNames.get(a.tag) ?? a.tag,
            min: a.min,
            max: a.max,
            default: a.defaultValue
          }))
          return {
            provider: 'google',
            key: f.family,
            name: f.family,
            category: mapGoogleCategory(f.category),
            designers: f.designers ?? [],
            version: f.lastModified ?? '',
            variants,
            axes,
            subsets: (f.subsets ?? []).filter((s) => s !== 'menu'),
            popularity: f.popularity ?? 9999,
            dateAdded: f.dateAdded,
            previewFamily: f.family,
            previewWeight: pv.weight,
            previewItalic: pv.italic
          }
        })
    })
  },

  async download(key, stagingDir, preferVariable): Promise<DownloadedFamily> {
    const list = parseGuarded<GDownload>(await getText(DOWNLOAD_LIST_URL + encodeURIComponent(key)))
    const refs = list.manifest.fileRefs
    const { files, variable } = selectGoogleFiles(
      refs.map((r) => r.filename),
      preferVariable
    )
    if (!files.length) throw new Error(`No installable files for ${key}`)
    await mkdir(stagingDir, { recursive: true })
    const written: string[] = []
    for (const name of files) {
      const ref = refs.find((r) => r.filename === name)!
      if (!/^https:\/\/fonts\.gstatic\.com\//.test(ref.url)) throw new Error(`Unexpected download host for ${name}`)
      const out = join(stagingDir, safeName(basename(name)))
      await writeFile(out, await getBuffer(ref.url))
      written.push(out)
    }
    for (const f of list.manifest.files) {
      if (/\.(txt|md)$/i.test(f.filename)) await writeFile(join(stagingDir, safeName(basename(f.filename))), f.contents)
    }
    const catalog = await google.catalog()
    const version = catalog.find((c) => c.key === key)?.version ?? ''
    return { files: written, version, variable }
  },

  async previewCss(families) {
    const parts = await Promise.all(
      families.map(async (f) => {
        const spec =
          f.previewWeight === 400 && !f.previewItalic
            ? f.key
            : `${f.key}:ital,wght@${f.previewItalic ? 1 : 0},${f.previewWeight}`
        const url = `${CSS_URL}?family=${encodeURIComponent(spec).replace(/%20/g, '+')}&display=swap`
        if (cssCache.has(url)) return cssCache.get(url)!
        try {
          const css = absolutizeCss(await getText(url, BROWSER_UA))
          cssCache.set(url, css)
          return css
        } catch {
          return ''
        }
      })
    )
    return parts.join('\n')
  }
}
