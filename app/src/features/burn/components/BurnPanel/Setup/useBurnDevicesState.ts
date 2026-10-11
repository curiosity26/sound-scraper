import { useCallback, useEffect, useState } from 'react'

import type { Device, SimSettings } from '@/bridge/generated'
import { burnApi } from '@/features/burn/burnApi'
import { errorText } from '@/shared/utils/errorText'

export type UseBurnDevicesStateResult = {
  /** The drives (and the image writer), polled while the setup shows. */
  readonly devices: readonly Device[]
  readonly deviceId: string | undefined
  /** The chosen device, while it's still there. */
  readonly device: Device | undefined
  readonly selectDevice: (id: string) => void
  /** The simulator's settings, once the simulator shows up (test builds). */
  readonly sim: SimSettings | undefined
  readonly changeSim: (change: Partial<SimSettings>) => void
}

/**
 * The devices to burn to, refreshed every 2 seconds, the chosen one, and
 * the simulator's settings. `onError` must be stable (a state setter).
 * Part of useBurnSetupState.
 */
export const useBurnDevicesState = (
  onError: (message: string) => void,
): UseBurnDevicesStateResult => {
  const [devices, setDevices] = useState<readonly Device[]>([])
  const [deviceId, setDeviceId] = useState<string>()
  const [sim, setSim] = useState<SimSettings>()

  const refresh = useCallback(() => {
    try {
      const { devices: list } = burnApi.devices()
      setDevices(list)
      setDeviceId(id => (id && list.some(d => d.id === id) ? id : list[0]?.id))
      setSim(
        s =>
          s ??
          (list.some(d => d.id === 'sim') ? burnApi.simSettings() : undefined),
      )
    } catch (e) {
      onError(errorText(e))
    }
  }, [onError])
  // Drives come and go, and discs go in and out.
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 2000)
    return () => {
      clearInterval(timer)
    }
  }, [refresh])

  const changeSim = (change: Partial<SimSettings>) => {
    if (!sim) {
      return
    }
    const next = { ...sim, ...change }
    setSim(next)
    try {
      burnApi.setSimSettings(next)
      refresh()
    } catch (e) {
      onError(errorText(e))
    }
  }

  return {
    devices,
    deviceId,
    device: devices.find(d => d.id === deviceId),
    selectDevice: setDeviceId,
    sim,
    changeSim,
  }
}
