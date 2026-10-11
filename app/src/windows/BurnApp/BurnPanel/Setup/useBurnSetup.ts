import { useContext } from 'react'

import { BurnSetupContext } from './BurnSetupContext'
import type { UseBurnSetupStateResult } from './useBurnSetupState'

export type UseBurnSetupResult = UseBurnSetupStateResult

/** The burn being set up: devices, options and error, inside Setup. */
export const useBurnSetup = (): UseBurnSetupResult => {
  const setup = useContext(BurnSetupContext)
  if (!setup) {
    throw new Error('useBurnSetup is used outside Setup')
  }
  return setup
}
