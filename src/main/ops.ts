import type { ActivationMode, ActivationResult, FaceInfo } from '@shared/types'
import { activation } from './activation'
import { library } from './library'
import { settingsStore } from './state'

function displayNames(faces: FaceInfo[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const f of faces) {
    // For collections use the first face's name, which is how Windows lists them too.
    if (!names.has(f.path)) names.set(f.path, f.fullName || `${f.family} ${f.style}`)
  }
  return names
}

export function activateFaces(faces: FaceInfo[], mode?: ActivationMode): ActivationResult {
  const sources = new Map(library.sources().map((s) => [s.id, s]))
  const allowed = faces.filter((f) => !sources.get(f.sourceId)?.readonly)
  const result = activation.activate(
    allowed.map((f) => f.path),
    mode ?? settingsStore.get().activationMode,
    displayNames(allowed)
  )
  const readonlyCount = faces.length - allowed.length
  if (readonlyCount) result.skipped.push({ path: '', reason: `${readonlyCount} font(s) are already installed in the OS` })
  return result
}

export function deactivateFaces(faces: FaceInfo[]): ActivationResult {
  return activation.deactivate(faces.map((f) => f.path))
}

export function facesUnder(dir: string): FaceInfo[] {
  const prefix = dir.toLowerCase().replace(/[\\/]+$/, '') + (process.platform === 'win32' ? '\\' : '/')
  return library.snapshot().faces.filter((f) => f.path.toLowerCase().startsWith(prefix))
}
