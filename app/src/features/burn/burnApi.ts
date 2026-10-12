// The burn panel's data (docs/playlists-and-cd-burning-design.md §6): the
// core's burn API (ss_burn), and the pure rules for what can be burned
// where, unit-tested.
import type { BurnOptions, BurnRequest, SimSettings } from '@/bridge/generated'
import { NativeSoundScraper } from '@/bridge/NativeSoundScraper'
import { requestReply } from '@/bridge/requestReply'
import { type Guard, isNumber, isOneOf } from '@/shared/utils/guards'

import { isBurnStatus } from './guards/isBurnStatus'
import { isDevicesAnswer } from './guards/isDevicesAnswer'
import { isSimSettings } from './guards/isSimSettings'

/**
 * A burn request (ss_burn) whose answer must match `isOk`; throws the core's
 * message on failure.
 */
const call = <T>(request: BurnRequest, isOk: Guard<T>): T =>
  requestReply(
    json => NativeSoundScraper.burn(json),
    request,
    isOk,
    'burn answer',
  )

/** The answer of the requests that only change something. */
const isDone = isOneOf(null)

export const burnApi = {
  devices: () => call({ op: 'devices' }, isDevicesAnswer),
  /** Starts a burn; returns the job id to poll. */
  start: (options: BurnOptions) => call({ op: 'start', ...options }, isNumber),
  status: (id: number) => call({ op: 'status', id }, isBurnStatus),
  cancel: (id: number) => {
    call({ op: 'cancel', id }, isDone)
  },
  close: (id: number) => {
    call({ op: 'close', id }, isDone)
  },
  simSettings: () => call({ op: 'simSettings' }, isSimSettings),
  setSimSettings: (settings: SimSettings) => {
    call({ op: 'setSimSettings', settings }, isDone)
  },
  reveal: (path: string) => {
    call({ op: 'reveal', path }, isDone)
  },
  saveLog: (id: number, path: string) => {
    call({ op: 'saveLog', id, path }, isDone)
  },
}
