import { useContext } from 'react'

import { BurnDevicesContext } from './BurnDevicesContext'
import type { UseBurnDevicesStateResult } from './useBurnDevicesState'

export type UseBurnDevicesResult = UseBurnDevicesStateResult

/** The devices to burn to, the chosen one and the simulator, inside Setup. */
export const useBurnDevices = (): UseBurnDevicesResult => {
  const devices = useContext(BurnDevicesContext)
  if (!devices) {
    throw new Error('useBurnDevices is used outside Setup')
  }
  return devices
}
