import { createContext } from 'react'

import type { UseBurnProgressStateResult } from './useBurnProgressState'

/** The job Progress shows, polled once and read by its parts. */
export const BurnProgressContext =
  createContext<UseBurnProgressStateResult | null>(null)
