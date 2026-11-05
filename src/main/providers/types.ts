import type { CatalogFamily, ProviderId } from '@shared/types'

export interface DownloadedFamily {
  /** Files written into the staging directory (absolute paths). */
  files: string[]
  version: string
  variable: boolean
}

export interface Provider {
  id: ProviderId
  /** Full catalog; implementations cache to disk. */
  catalog(force?: boolean): Promise<CatalogFamily[]>
  /** Download a family into `stagingDir`. */
  download(key: string, stagingDir: string, preferVariable: boolean): Promise<DownloadedFamily>
  previewCss(families: CatalogFamily[]): Promise<string>
}

/** Strip characters that are illegal in Windows file names. */
export function safeName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 120) || 'font'
}
