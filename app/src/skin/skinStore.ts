import type { ResolvedSkin } from '@/native/bridge'

import { setImageRevision } from './setImageRevision'
import { skins } from './skins'

// The current skin, shared by every window (they run in one JS runtime), so
// choosing a skin in the settings window re-skins the main panel.
let current: ResolvedSkin | undefined
const listeners = new Set<(skin: ResolvedSkin) => void>()

export const skinStore = {
  get: (): ResolvedSkin | undefined => current,
  set: (skin: ResolvedSkin) => {
    current = skin
    setImageRevision(skin.revision)
    listeners.forEach(l => {
      l(skin)
    })
  },
  subscribe: (listener: (skin: ResolvedSkin) => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  /** Reloads the skin chosen in the settings. */
  reload: async (): Promise<ResolvedSkin> => {
    const skin = await skins.loadCurrent()
    skinStore.set(skin)
    return skin
  },
}
