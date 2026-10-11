import { setImageRevision } from './setImageRevision'
import { skins } from './skins'
import type { Skin } from './types'

// The current skin, shared by every window (they run in one JS runtime), so
// choosing a skin in the settings window re-skins the main panel.
let current: Skin | undefined
const listeners = new Set<(skin: Skin) => void>()

export const skinStore = {
  get: (): Skin | undefined => current,
  set: (skin: Skin) => {
    current = skin
    setImageRevision(skin.revision)
    listeners.forEach(l => {
      l(skin)
    })
  },
  subscribe: (listener: (skin: Skin) => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  /** Reloads the skin chosen in the settings. */
  reload: async (): Promise<Skin> => {
    const skin = await skins.loadCurrent()
    skinStore.set(skin)
    return skin
  },
}
