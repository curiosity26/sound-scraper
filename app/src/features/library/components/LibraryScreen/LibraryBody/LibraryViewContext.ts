import { createContext } from 'react'

import type { LibraryView } from './types'

/**
 * The library this component is part of, once it's read (one per
 * LibraryScreen): set by LibraryBody, so each part reads what it shows
 * instead of taking it as props.
 */
export const LibraryViewContext = createContext<LibraryView | null>(null)
