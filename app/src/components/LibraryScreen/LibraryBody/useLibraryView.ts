import { useContext } from 'react'

import { LibraryViewContext } from './LibraryViewContext'
import type { LibraryView } from './types'

/** The library this component shows (inside a LibraryBody). */
export const useLibraryView = (): LibraryView => {
  const view = useContext(LibraryViewContext)
  if (!view) {
    throw new Error('useLibraryView outside a LibraryBody')
  }
  return view
}
