import { createContext } from 'react'

import type { UseBurnDevicesStateResult } from './useBurnDevicesState'

/** Setup's devices, polled once and read by its parts. */
export const BurnDevicesContext =
  createContext<UseBurnDevicesStateResult | null>(null)
