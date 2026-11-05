import type { ActivationResult, Collection, FaceInfo } from '@shared/types'
import type { Family } from '@shared/families'
import { api, run, useStore } from '../store'

function report(r: ActivationResult | undefined, verb: 'Activated' | 'Deactivated', what: string): void {
  if (!r) return
  const st = useStore.getState()
  const n = verb === 'Activated' ? r.activated : r.deactivated
  const skipped = r.skipped.filter((s) => s.path)
  if (n) st.toast('success', `${verb} ${what}`)
  if (skipped.length) {
    const reasons = [...new Set(skipped.map((s) => s.reason))].join('; ')
    st.toast(n ? 'info' : 'error', `${skipped.length} file(s) skipped: ${reasons}`)
  }
}

export async function setFamiliesActive(families: Family[], on: boolean): Promise<void> {
  const ids = families.flatMap((f) => f.faces.map((x) => x.id))
  const what = families.length === 1 ? families[0].name : `${families.length} families`
  if (on) report(await run(api().activate(ids)), 'Activated', what)
  else report(await run(api().deactivate(ids)), 'Deactivated', what)
}

export async function setFaceActive(face: FaceInfo, on: boolean): Promise<void> {
  if (on) report(await run(api().activate([face.id])), 'Activated', face.fullName)
  else report(await run(api().deactivate([face.id])), 'Deactivated', face.fullName)
}

export async function saveCollection(c: Collection): Promise<void> {
  const collections = await run(api().saveCollection(c))
  if (collections) useStore.setState({ collections })
}

export async function toggleInCollection(collectionId: string, family: string): Promise<void> {
  const c = useStore.getState().collections.find((x) => x.id === collectionId)
  if (!c) return
  const has = c.families.includes(family)
  await saveCollection({ ...c, families: has ? c.families.filter((f) => f !== family) : [...c.families, family] })
}

export function isFavorite(family: string): boolean {
  return Boolean(useStore.getState().collections.find((c) => c.id === 'favorites')?.families.includes(family))
}

export async function copyText(text: string, label = 'Copied'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    useStore.getState().toast('success', label)
  } catch {
    useStore.getState().toast('error', 'Clipboard unavailable')
  }
}
