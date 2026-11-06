import { writeFile, mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Axis, CatalogFamily } from '@shared/types'
import log from '../log'
import { absolutizeCss, getBuffer, getText } from './http'
import { cachedCatalog } from './cache'
import {
  expandVariableVariants,
  googleApiDownloads,
  googleAxisName,
  googlePreviewVariant,
  mapGoogleCategory,
  normalizeGoogleVariant,
  selectGoogleFiles
} from './select'
import { safeName, type DownloadedFamily, type Provider } from './types'

const API_URL = 'https://www.googleapis.com/webfonts/v1/webfonts'
const CSS_URL = 'https://fonts.googleapis.com/css2'
// Google picks the font format from the UA; ask for woff2 like a modern browser.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const GSTATIC = /^https:\/\/fonts\.gstatic\.com\//

/**
 * Official builds embed a Google Fonts Developer API key at build time
 * (MAIN_VITE_GOOGLE_FONTS_API_KEY). GOOGLE_FONTS_API_KEY overrides it at runtime.
 * Builds from source without a key fall back to the public fonts.google.com
 * endpoints, which are undocumented and may change.
 */
function apiKey(): string {
  return (process.env.GOOGLE_FONTS_API_KEY || import.meta.env.MAIN_VITE_GOOGLE_FONTS_API_KEY || '').trim()
}

// ---------------------------------------------------------------- Developer API

interface GApiItem {
  family: string
  variants: string[]
  subsets: string[]
  version: string
  lastModified: string
  files: Record<string, string>
  category: string
  axes?: { tag: string; start: number; end: number }[]
}

async function apiList(params: Record<string, string>): Promise<GApiItem[]> {
  const qs = new URLSearchParams({ key: apiKey(), ...params })
  const res = JSON.parse(await getText(`${API_URL}?${qs}`)) as { items?: GApiItem[] }
  return res.items ?? []
}

async function apiCatalog(): Promise<CatalogFamily[]> {
  // Sorted by popularity so the list position doubles as the popularity rank.
  const items = await apiList({ sort: 'popularity', capability: 'VF' })
  return items.map((f, rank): CatalogFamily => {
    const variants = expandVariableVariants((f.variants ?? []).map(normalizeGoogleVariant), f.axes ?? [])
    const pv = googlePreviewVariant(variants)
    const axes: Axis[] = (f.axes ?? [])
      .filter((a) => a.tag !== 'ital')
      .map((a) => ({
        tag: a.tag,
        name: googleAxisName(a.tag),
        min: a.start,
        max: a.end,
        default: a.tag === 'wght' ? Math.min(Math.max(400, a.start), a.end) : a.start
      }))
    return {
      provider: 'google',
      key: f.family,
      name: f.family,
      category: mapGoogleCategory(f.category),
      designers: [], // not provided by the Developer API
      version: f.lastModified ?? '',
      variants,
      axes,
      subsets: (f.subsets ?? []).filter((s) => s !== 'menu'),
      popularity: rank + 1,
      dateAdded: f.lastModified, // the API has no "date added"; "Newest" sorts by last update
      previewFamily: f.family,
      previewWeight: pv.weight,
      previewItalic: pv.italic
    }
  })
}

async function apiDownload(key: string, stagingDir: string, preferVariable: boolean): Promise<DownloadedFamily> {
  const params: Record<string, string> = { family: key }
  if (preferVariable) params.capability = 'VF'
  const item = (await apiList(params)).find((f) => f.family === key)
  if (!item) throw new Error(`${key} is not in the Google Fonts catalogue`)
  const tags = preferVariable ? (item.axes ?? []).map((a) => a.tag) : []
  const downloads = googleApiDownloads(item.family, item.files ?? {}, tags)
  if (!downloads.length) throw new Error(`No installable files for ${key}`)
  await mkdir(stagingDir, { recursive: true })
  const written: string[] = []
  for (const d of downloads) {
    if (!GSTATIC.test(d.url)) throw new Error(`Unexpected download host for ${key}`)
    const out = join(stagingDir, safeName(d.filename))
    await writeFile(out, await getBuffer(d.url))
    written.push(out)
  }
  return { files: written, version: item.lastModified ?? '', variable: downloads.some((d) => d.filename.includes('[')) }
}

// ------------------------------------------------- Fallback for keyless builds

const METADATA_URL = 'https://fonts.google.com/metadata/fonts'
const DOWNLOAD_LIST_URL = 'https://fonts.google.com/download/list?family='

/** Google prefixes these JSON responses with an XSSI guard: `)]}'` */
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
  manifest: {
    files: { filename: string; contents: string }[]
    fileRefs: { filename: string; url: string }[]
  }
}

async function legacyCatalog(): Promise<CatalogFamily[]> {
  const meta = parseGuarded<GMeta>(await getText(METADATA_URL))
  const axisNames = new Map(meta.axisRegistry.map((a) => [a.tag, a.displayName]))
  return meta.familyMetadataList
    .filter((f) => f.isOpenSource !== false && !f.isBrandFont)
    .map((f): CatalogFamily => {
      const variants = Object.keys(f.fonts ?? {})
      const pv = googlePreviewVariant(variants)
      return {
        provider: 'google',
        key: f.family,
        name: f.family,
        category: mapGoogleCategory(f.category),
        designers: f.designers ?? [],
        version: f.lastModified ?? '',
        variants,
        axes: (f.axes ?? []).map((a) => ({
          tag: a.tag,
          name: axisNames.get(a.tag) ?? a.tag,
          min: a.min,
          max: a.max,
          default: a.defaultValue
        })),
        subsets: (f.subsets ?? []).filter((s) => s !== 'menu'),
        popularity: f.popularity ?? 9999,
        dateAdded: f.dateAdded,
        previewFamily: f.family,
        previewWeight: pv.weight,
        previewItalic: pv.italic
      }
    })
}

async function legacyDownload(key: string, stagingDir: string, preferVariable: boolean): Promise<DownloadedFamily> {
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
    if (!GSTATIC.test(ref.url)) throw new Error(`Unexpected download host for ${name}`)
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
}

// ---------------------------------------------------------------- Provider

let warned = false
function useApi(): boolean {
  const has = apiKey().length > 0
  if (!has && !warned) {
    warned = true
    log.warn('google: no Developer API key configured; using the fonts.google.com fallback')
  }
  return has
}

const cssCache = new Map<string, string>()

export const google: Provider = {
  id: 'google',

  catalog(force = false) {
    return cachedCatalog('google', force, () => (useApi() ? apiCatalog() : legacyCatalog()))
  },

  download(key, stagingDir, preferVariable) {
    return useApi() ? apiDownload(key, stagingDir, preferVariable) : legacyDownload(key, stagingDir, preferVariable)
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
