// The apps the plain UI can record and the chosen one (remembered from the
// last recording), shared by the source picker and the record bar.
import type { AudioApp } from '@/native/types'
import { rememberedPid } from '@/recorder/rememberedPid'
import { safeList } from '@/recorder/safeList'

export type CaptureSources = {
  readonly apps: readonly AudioApp[]
  /** 0 = all system audio. */
  readonly selectedPid: number
}

let current: CaptureSources | undefined
const listeners = new Set<() => void>()

const get = (): CaptureSources => {
  if (!current) {
    const apps = safeList()
    current = { apps, selectedPid: rememberedPid(apps) }
  }
  return current
}

const update = (change: Partial<CaptureSources>) => {
  current = { ...get(), ...change }
  listeners.forEach(l => {
    l()
  })
}

export const captureSources = {
  get,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  select: (pid: number) => {
    update({ selectedPid: pid })
  },
  /** Lists the apps again. */
  refresh: () => {
    update({ apps: safeList() })
  },
}
