import type { ResolvedSkin } from '@/bridge/generated'

import { setImageRevision } from './setImageRevision'
import { skins } from './skins'

// The current skin, shared by every window (they run in one JS runtime), so
// choosing a skin in the settings window re-skins the main panel.
let current: ResolvedSkin | undefined
const listeners = new Set<(skin: ResolvedSkin) => void>()
// The first load, shared by every window that needs the skin before there
// is one. A failed one is kept: use() asks again after it rejects, and a
// fresh load each time would never let the error through.
let firstLoad: Promise<ResolvedSkin> | undefined

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
  /**
   * Loads the skin chosen in the settings, once however many windows ask
   * at the same time (a stable promise for use(); see SkinProvider).
   */
  load: (): Promise<ResolvedSkin> => {
    firstLoad ??= skinStore.reload()
    return firstLoad
  },
  /** Reloads the skin chosen in the settings. */
  reload: async (): Promise<ResolvedSkin> => {
    const skin = await skins.loadCurrent()
    skinStore.set(skin)
    return skin
  },
}
