import { createContext } from 'react'

import type { LibraryScreenProps } from './LibraryScreen'

/**
 * The LibraryScreen this component is part of: how it's set up (text style,
 * menus, details window, burn…). Per screen, since the main window and the
 * library window can each show one.
 */
export const LibraryScreenContext = createContext<LibraryScreenProps | null>(
  null,
)
