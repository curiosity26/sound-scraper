// The burn panel's data (docs/playlists-and-cd-burning-design.md §6): the
// core's burn API (ss_burn), and the pure rules for what can be burned
// where, unit-tested.
import NativeSoundScraper from '@/native/NativeSoundScraper'

import type { BurnOptions, BurnStatus, Device, SimSettings } from './types'

function call<T>(request: object): T {
  const answer = JSON.parse(
    NativeSoundScraper.burn(JSON.stringify(request)),
  ) as {
    ok?: T
    error?: string
  }
  if (answer.error !== undefined) {
    throw new Error(answer.error)
  }
  return answer.ok as T
}

export const burnApi = {
  devices: () =>
    call<{ devices: Device[]; simulator: boolean }>({ op: 'devices' }),
  /** Starts a burn; returns the job id to poll. */
  start: (options: BurnOptions) => call<number>({ op: 'start', ...options }),
  status: (id: number) => call<BurnStatus>({ op: 'status', id }),
  cancel: (id: number) => call<null>({ op: 'cancel', id }),
  close: (id: number) => call<null>({ op: 'close', id }),
  simSettings: () => call<SimSettings>({ op: 'simSettings' }),
  setSimSettings: (settings: SimSettings) =>
    call<null>({ op: 'setSimSettings', settings }),
  reveal: (path: string) => call<null>({ op: 'reveal', path }),
  saveLog: (id: number, path: string) =>
    call<null>({ op: 'saveLog', id, path }),
}
