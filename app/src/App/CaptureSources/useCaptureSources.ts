import { use } from 'react'

import type { AudioApp } from '@/native/types'

import { CaptureSourcesContext } from './CaptureSourcesContext'

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

/** The apps that can be recorded and the chosen one. */
export const useCaptureSources = (): UseCaptureSourcesResult => {
  const sources = use(CaptureSourcesContext)
  if (!sources) {
    throw new Error('useCaptureSources needs a CaptureSourcesProvider')
  }
  return sources
}
