import { createContext } from 'react'

import type { UseBurnSetupStateResult } from './useBurnSetupState'

/** The burn being set up, owned by Setup and read by its parts. */
export const BurnSetupContext = createContext<UseBurnSetupStateResult | null>(
  null,
)
