import type { AbogangsterApi } from '@shared/ipc'

declare global {
  interface Window {
    api: AbogangsterApi
  }
}

export {}
