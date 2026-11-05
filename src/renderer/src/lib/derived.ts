import { useMemo } from 'react'
import type { Source } from '@shared/types'
import { familyState, matchesFilter, type ActiveState, type Family } from '@shared/families'
import { useStore, type Nav } from '../store'

export interface Derived {
  sources: Map<string, Source>
  external: Set<string>
  stateOf: (f: Family) => ActiveState
}

export function useDerived(): Derived {
  const library = useStore((s) => s.library)
  return useMemo(() => {
    const sources = new Map(library.sources.map((s) => [s.id, s]))
    const external = new Set(library.externallyRegistered)
    const cache = new Map<Family, ActiveState>()
    return {
      sources,
      external,
      stateOf: (f: Family) => {
        let st = cache.get(f)
        if (!st) {
          st = familyState(f, sources, library.activations, external)
          cache.set(f, st)
        }
        return st
      }
    }
  }, [library])
}

/** Families for the current navigation + filters + sort. */
export function useVisibleFamilies(nav: Nav): Family[] {
  const families = useStore((s) => s.families)
  const collections = useStore((s) => s.collections)
  const query = useStore((s) => s.query)
  const categories = useStore((s) => s.categories)
  const variableOnly = useStore((s) => s.variableOnly)
  const monospaceOnly = useStore((s) => s.monospaceOnly)
  const script = useStore((s) => s.script)
  const sort = useStore((s) => s.sort)
  const d = useDerived()

  return useMemo(() => {
    let list = families
    switch (nav.kind) {
      case 'active':
        list = list.filter((f) => {
          const st = d.stateOf(f)
          return st === 'on' || st === 'partial'
        })
        break
      case 'installed':
        list = list.filter((f) => f.faces.some((x) => d.sources.get(x.sourceId)?.readonly))
        break
      case 'source':
        list = list
          .map((f) => {
            const faces = f.faces.filter((x) => x.sourceId === nav.id)
            return faces.length === f.faces.length ? f : faces.length ? { ...f, faces, primary: faces[0] } : null
          })
          .filter((f): f is Family => f !== null)
        break
      case 'collection': {
        const c = collections.find((x) => x.id === nav.id)
        const names = new Set(c?.families ?? [])
        list = list.filter((f) => names.has(f.name))
        break
      }
      default:
        break
    }
    const filter = { query, categories, variableOnly, monospaceOnly, script }
    list = list.filter((f) => matchesFilter(f, filter))
    if (sort === 'newest') list = [...list].sort((a, b) => b.newest - a.newest)
    else if (sort === 'styles') list = [...list].sort((a, b) => b.faces.length - a.faces.length)
    return list
  }, [families, collections, nav, query, categories, variableOnly, monospaceOnly, script, sort, d])
}
