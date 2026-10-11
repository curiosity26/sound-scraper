// The burn panel's data (docs/playlists-and-cd-burning-design.md §6): the
// core's burn API (ss_burn), and the pure rules for what can be burned
// where, unit-tested.
import NativeSoundScraper from '@/native/NativeSoundScraper'
import { isRecord } from '@/utils/isRecord'

import type { BurnOptions, BurnStatus, Device, SimSettings } from './types'

/** Sends `request` to the core; returns its `ok` value (unchecked). */
const call = (request: object): unknown => {
  const answer: unknown = JSON.parse(
    NativeSoundScraper.burn(JSON.stringify(request)),
  )
  if (!isRecord(answer)) {
    throw new Error('Unexpected answer from the burn core')
  }
  if (typeof answer.error === 'string') {
    throw new Error(answer.error)
  }
  return answer.ok
}

const isDevice = (value: unknown): value is Device =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.kind === 'string' &&
  isRecord(value.media) &&
  typeof value.media.state === 'string'

const isDevicesAnswer = (
  value: unknown,
): value is {
  readonly devices: readonly Device[]
  readonly simulator: boolean
} =>
  isRecord(value) &&
  Array.isArray(value.devices) &&
  value.devices.every(isDevice) &&
  typeof value.simulator === 'boolean'

const isBurnStatus = (value: unknown): value is BurnStatus =>
  isRecord(value) &&
  typeof value.state === 'string' &&
  Array.isArray(value.tracks) &&
  Array.isArray(value.log)

const isSimSettings = (value: unknown): value is SimSettings =>
  isRecord(value) &&
  typeof value.media === 'string' &&
  isRecord(value.fault) &&
  typeof value.fault.kind === 'string'

/** `value`, if `guard` accepts it; throws otherwise. */
const checked = <T>(
  value: unknown,
  guard: (v: unknown) => v is T,
  op: string,
): T => {
  if (!guard(value)) {
    throw new Error(`Unexpected answer from the burn core (${op})`)
  }
  return value
}

export const burnApi = {
  devices: () => checked(call({ op: 'devices' }), isDevicesAnswer, 'devices'),
  /** Starts a burn; returns the job id to poll. */
  start: (options: BurnOptions) =>
    checked(
      call({ op: 'start', ...options }),
      (v): v is number => typeof v === 'number',
      'start',
    ),
  status: (id: number) =>
    checked(call({ op: 'status', id }), isBurnStatus, 'status'),
  cancel: (id: number) => {
    call({ op: 'cancel', id })
  },
  close: (id: number) => {
    call({ op: 'close', id })
  },
  simSettings: () =>
    checked(call({ op: 'simSettings' }), isSimSettings, 'simSettings'),
  setSimSettings: (settings: SimSettings) => {
    call({ op: 'setSimSettings', settings })
  },
  reveal: (path: string) => {
    call({ op: 'reveal', path })
  },
  saveLog: (id: number, path: string) => {
    call({ op: 'saveLog', id, path })
  },
}
