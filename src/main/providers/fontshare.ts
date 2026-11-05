import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import AdmZip from 'adm-zip'
import type { CatalogFamily } from '@shared/types'
import { absolutizeCss, getBuffer, getJson, getText } from './http'
import { cachedCatalog } from './cache'
import { mapFontshareCategory, selectFontshareEntries } from './select'
import { safeName, type DownloadedFamily, type Provider } from './types'

const API = 'https://api.fontshare.com/v2'

interface FsFont {
  slug: string
  name: string
  version: string
  category: string
  inserted_at?: string
  views?: number
  designers?: { name: string }[]
  styles?: { default?: boolean; is_variable?: boolean; is_italic?: boolean; weight?: { number?: number; name?: string } }[]
}

const cssCache = new Map<string, string>()

export const fontshare: Provider = {
  id: 'fontshare',

  catalog(force = false) {
    return cachedCatalog('fontshare', force, async () => {
      const fonts: FsFont[] = []
      for (let offset = 0; offset < 2000; offset += 100) {
        const page = await getJson<{ fonts: FsFont[]; has_more: boolean }>(`${API}/fonts?offset=${offset}&limit=100`)
        fonts.push(...page.fonts)
        if (!page.has_more) break
      }
      return fonts.map((f): CatalogFamily => {
        const styles = f.styles ?? []
        const def = styles.find((s) => s.default) ?? styles.find((s) => !s.is_italic && !s.is_variable) ?? styles[0]
        const variants = styles
          .filter((s) => !s.is_variable)
          .map((s) => `${s.weight?.number ?? 400}${s.is_italic ? 'i' : ''}`)
        return {
          provider: 'fontshare',
          key: f.slug,
          name: f.name,
          category: mapFontshareCategory(f.category),
          designers: (f.designers ?? []).map((d) => d.name),
          version: f.version ?? '',
          variants: [...new Set(variants)],
          axes: styles.some((s) => s.is_variable) ? [{ tag: 'wght', name: 'Weight', min: 100, max: 900, default: 400 }] : [],
          subsets: [],
          popularity: -(f.views ?? 0),
          dateAdded: f.inserted_at?.slice(0, 10),
          previewFamily: f.name,
          previewWeight: def?.weight?.number ?? 400,
          previewItalic: Boolean(def?.is_italic)
        }
      })
    })
  },

  async download(key, stagingDir, preferVariable): Promise<DownloadedFamily> {
    if (!/^[a-z0-9-]+$/.test(key)) throw new Error('Invalid Fontshare family')
    const zip = new AdmZip(await getBuffer(`${API}/fonts/download/${key}`))
    const entries = zip.getEntries().filter((e) => !e.isDirectory)
    const { files, variable } = selectFontshareEntries(
      entries.map((e) => e.entryName),
      preferVariable
    )
    if (!files.length) throw new Error(`No installable files for ${key}`)
    await mkdir(stagingDir, { recursive: true })
    const written: string[] = []
    for (const name of files) {
      const entry = entries.find((e) => e.entryName === name)!
      // Only ever use the base name: protects against zip-slip paths.
      const out = join(stagingDir, safeName(basename(name)))
      await writeFile(out, entry.getData())
      written.push(out)
    }
    const license = entries.find((e) => /licen[cs]e/i.test(basename(e.entryName)) && /\.(txt|md|pdf)$/i.test(e.entryName))
    if (license) await writeFile(join(stagingDir, safeName(basename(license.entryName))), license.getData())
    const catalog = await fontshare.catalog()
    return { files: written, version: catalog.find((c) => c.key === key)?.version ?? '', variable }
  },

  async previewCss(families) {
    if (!families.length) return ''
    const qs = families.map((f) => `f[]=${encodeURIComponent(f.key)}@${f.previewWeight}`).join('&')
    const url = `${API}/css?${qs}&display=swap`
    if (cssCache.has(url)) return cssCache.get(url)!
    try {
      const css = absolutizeCss(await getText(url))
      cssCache.set(url, css)
      return css
    } catch {
      return ''
    }
  }
}
