import { use } from 'react'

import { OverlayContext } from './OverlayContext'
import type { OverlayName } from './types'

export type UseOverlayResult = {
  readonly shown: OverlayName | undefined
  readonly open: (name: OverlayName) => void
  readonly close: () => void
}

/** The side panel shown over the library, with open and close. */
export const useOverlay = (): UseOverlayResult => {
  const overlay = use(OverlayContext)
  if (!overlay) {
    throw new Error('useOverlay needs an OverlayProvider')
  }
  return overlay
}
