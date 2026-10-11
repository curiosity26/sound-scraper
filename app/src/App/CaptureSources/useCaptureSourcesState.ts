import { useState } from 'react'

import type { AudioApp } from '@/native/types'
import { rememberedPid } from '@/recorder/rememberedPid'
import { safeList } from '@/recorder/safeList'

import type { UseCaptureSourcesResult } from './useCaptureSources'

/** Owns the source list and choice for CaptureSourcesProvider; the choice
 * starts at the source of the last recording. */
export const useCaptureSourcesState = (): UseCaptureSourcesResult => {
  const [apps, setApps] = useState<AudioApp[]>(safeList)
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
