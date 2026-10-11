import { useSyncExternalStore } from 'react'

import { selection } from '@/library/selection'

export type UseSelectionResult = {
  /** The selected recordings' file names (none, one, or several). */
  readonly fileNames: readonly string[]
}

/** The library selection, re-rendering when it changes. */
export const useSelection = (): UseSelectionResult => {
  const fileNames = useSyncExternalStore(selection.subscribe, selection.get)
  return { fileNames }
}
