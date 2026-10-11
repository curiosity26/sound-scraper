import { settings } from '@/native/settings'

// Double-size mode, shared by the windows and saved in the settings.
let doubleSize: boolean | undefined
const sizeListeners = new Set<(on: boolean) => void>()

export const doubleSizeStore = {
  get: (): boolean => {
    if (doubleSize === undefined) {
      try {
        doubleSize = settings.get().doubleSize
      } catch {
        doubleSize = false
      }
    }
    return doubleSize
  },
  set: (on: boolean) => {
    doubleSize = on
    sizeListeners.forEach(l => {
      l(on)
    })
    try {
      settings.set({ ...settings.get(), doubleSize: on }).catch(() => {})
    } catch {}
  },
  subscribe: (listener: (on: boolean) => void): (() => void) => {
    sizeListeners.add(listener)
    return () => sizeListeners.delete(listener)
  },
}
