import { createContext } from 'react'

import type { LibraryTableState } from './types'

/**
 * The LibraryTable this component is part of: set by LibraryTable, so the
 * toolbar, the header and the rows share one search, sort and set of check
 * boxes without taking them as props.
 */
export const LibraryTableContext = createContext<LibraryTableState | null>(null)
