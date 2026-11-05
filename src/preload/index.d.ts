import type { TypeshelfApi } from '../shared/types'

declare global {
  interface Window {
    typeshelf: TypeshelfApi
  }
}

export {}
