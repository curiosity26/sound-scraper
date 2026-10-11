import { useSyncExternalStore } from 'react'

import { doubleSizeStore } from '@/features/skins/doubleSizeStore'

export type UseDoubleSizeResult = {
  readonly double: boolean
}

/** Double size (⌘D), shared by every window. */
export const useDoubleSize = (): UseDoubleSizeResult => {
  const double = useSyncExternalStore(
    doubleSizeStore.subscribe,
    doubleSizeStore.get,
  )
  return { double }
}
