import { useContext } from 'react'

import { LibraryTableContext } from './LibraryTableContext'
import type { LibraryTableState } from './types'

/** The table this component is part of (inside a LibraryTable). */
export const useLibraryTable = (): LibraryTableState => {
  const table = useContext(LibraryTableContext)
  if (!table) {
    throw new Error('useLibraryTable outside a LibraryTable')
  }
  return table
}
