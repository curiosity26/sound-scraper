import { useState } from 'react'

import type { Target } from '@/burn/types'

import {
  type UseBurnDevicesStateResult,
  useBurnDevicesState,
} from './useBurnDevicesState'
import { type UseBurnOptionsResult, useBurnOptions } from './useBurnOptions'

export type UseBurnSetupStateResult = {
  /** The playlist being set up. */
  readonly target: Target
  /** The devices, polled once for the setup. */
  readonly devices: UseBurnDevicesStateResult
  /** The burn options on the chosen device, and what follows from them. */
  readonly options: UseBurnOptionsResult
  /** Shown in the footer: from polling the devices or from starting. */
  readonly error: string | undefined
  readonly setError: (message: string | undefined) => void
}

/**
 * Setting up a burn of `target`: the devices, the options and the error
 * line. Setup owns it and shares it with its parts through
 * BurnSetupContext (read with useBurnSetup).
 */
export const useBurnSetupState = (target: Target): UseBurnSetupStateResult => {
  const [error, setError] = useState<string>()
  const devices = useBurnDevicesState(setError)
  const options = useBurnOptions(target, devices.device)
  return { target, devices, options, error, setError }
}
