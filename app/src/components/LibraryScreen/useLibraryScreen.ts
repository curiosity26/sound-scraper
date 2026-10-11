import { useContext } from 'react'

import type { LibraryScreenProps } from './LibraryScreen'
import { LibraryScreenContext } from './LibraryScreenContext'

/** How the LibraryScreen this component is part of is set up. */
export const useLibraryScreen = (): LibraryScreenProps => {
  const screen = useContext(LibraryScreenContext)
  if (!screen) {
    throw new Error('useLibraryScreen outside a LibraryScreen')
  }
  return screen
}
