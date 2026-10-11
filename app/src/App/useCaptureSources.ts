import { useState } from 'react'

import type { AudioApp } from '@/native/types'
import { rememberedPid } from '@/recorder/rememberedPid'
import { safeList } from '@/recorder/safeList'

export type UseCaptureSourcesResult = {
  readonly apps: readonly AudioApp[]
  /** 0 = all system audio. */
  readonly selectedPid: number
  /** The selected app, or undefined for all system audio. */
  readonly selectedApp: AudioApp | undefined
  readonly select: (pid: number) => void
  /** Lists the apps again. */
  readonly refresh: () => void
}

/** The apps that can be recorded and the chosen one (remembered from the
 * last recording). */
export const useCaptureSources = (): UseCaptureSourcesResult => {
  const [apps, setApps] = useState<AudioApp[]>(() => safeList())
  const [selectedPid, setSelectedPid] = useState(() => rememberedPid(apps))
  return {
    apps,
    selectedPid,
    selectedApp: apps.find(a => a.pid === selectedPid),
    select: setSelectedPid,
    refresh: () => {
      setApps(safeList())
    },
  }
}
