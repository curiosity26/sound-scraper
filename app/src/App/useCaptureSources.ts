import { useSyncExternalStore } from 'react'

import type { AudioApp } from '@/native/types'

import { type CaptureSources, captureSources } from './captureSources'

export type UseCaptureSourcesResult = CaptureSources & {
  /** The selected app, or undefined for all system audio. */
  readonly selectedApp: AudioApp | undefined
  readonly select: (pid: number) => void
  readonly refresh: () => void
}

/** The apps that can be recorded and the chosen one. */
export const useCaptureSources = (): UseCaptureSourcesResult => {
  const sources = useSyncExternalStore(
    captureSources.subscribe,
    captureSources.get,
  )
  return {
    ...sources,
    selectedApp: sources.apps.find(a => a.pid === sources.selectedPid),
    select: captureSources.select,
    refresh: captureSources.refresh,
  }
}
