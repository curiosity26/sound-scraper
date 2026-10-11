import { createContext } from 'react'

import type { UseOverlayResult } from './useOverlay'

export const OverlayContext = createContext<UseOverlayResult | undefined>(
  undefined,
)
