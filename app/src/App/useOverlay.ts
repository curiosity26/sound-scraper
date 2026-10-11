import { useSyncExternalStore } from 'react'

import { overlay, type OverlayName } from './overlay'

export type UseOverlayResult = {
  readonly shown: OverlayName | undefined
  readonly open: (name: OverlayName) => void
  readonly close: () => void
}

/** The side panel shown over the library, with open and close. */
export const useOverlay = (): UseOverlayResult => ({
  shown: useSyncExternalStore(overlay.subscribe, overlay.get),
  open: overlay.set,
  close: () => {
    overlay.set(undefined)
  },
})
