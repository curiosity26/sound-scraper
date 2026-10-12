import { useState } from 'react'

import { burnApi } from '@/features/burn/burnApi'
import { burnJob } from '@/features/burn/burnJob'
import { useBurnSetup } from '@/features/burn/components/BurnPanel/Setup/useBurnSetup'
import { errorText } from '@/shared/utils/errorText'
import { pickSaveFile } from '@/shared/utils/pickSaveFile'

export type UseBurnStartResult = {
  /** The burn button: starts, or first asks to erase a CD-RW. */
  readonly burn: () => void
  /** Asking whether to erase the CD-RW. */
  readonly confirmingErase: boolean
  readonly confirmErase: () => void
  readonly cancelErase: () => void
}

/**
 * Starting the burn: asks where to save an image, confirms erasing a
 * CD-RW, then starts the job and hands it to burnJob (the panel then
 * shows its progress).
 */
export const useBurnStart = (): UseBurnStartResult => {
  const { target, devices, options: setup, setError } = useBurnSetup()
  const { device } = devices
  const [confirm, setConfirm] = useState<null | (() => void)>(null)

  const start = async () => {
    if (!device) {
      return
    }
    setError(undefined)
    let imagePath: string | null = null
    if (device.kind === 'image') {
      imagePath = await pickSaveFile(
        'Save CD image',
        `${target.name}.cue`,
        'cue',
      )
      if (!imagePath) {
        return
      }
    }
    try {
      const id = burnApi.start({
        deviceId: device.id,
        title: target.name,
        tracks: target.tracks,
        gapSeconds: setup.gap,
        cdText: setup.cdText,
        testWrite: setup.testWrite && device.canTest,
        speed: setup.speed,
        eject: setup.isDrive && setup.eject,
        erase: device.media.state === 'erasable',
        imagePath,
      })
      burnJob.set({ id, target, started: Date.now() })
    } catch (e) {
      setError(errorText(e))
    }
  }

  /** A failed save dialog shows in the setup's error line. */
  const showError = (e: unknown) => {
    setError(errorText(e))
  }
  const startReporting = () => {
    start().catch(showError)
  }

  return {
    burn: () => {
      if (device?.media.state === 'erasable') {
        setConfirm(() => startReporting)
      } else {
        startReporting()
      }
    },
    confirmingErase: confirm !== null,
    confirmErase: () => {
      const run = confirm
      setConfirm(null)
      run?.()
    },
    cancelErase: () => {
      setConfirm(null)
    },
  }
}
