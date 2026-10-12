// The core's CD burner (ss_burn), faked for the fake core
// (./NativeSoundScraper.ts): the devices are arranged by the test; jobs
// aren't faked yet.
import type {
  BurnRequest,
  DevicesAnswer,
  SimSettings,
} from '@/bridge/generated'

export type BurnAnswer = DevicesAnswer | SimSettings

type State = { devices: DevicesAnswer }

const initialState = (): State => ({
  devices: { devices: [], simulator: false },
})

const state: State = initialState()

/** The test's handle on the fake burner. */
export const fakeBurner = {
  /** Answers one ss_burn request; throws for what isn't faked. */
  request: (request: BurnRequest): BurnAnswer => {
    switch (request.op) {
      case 'devices':
        return state.devices
      case 'simSettings':
        return { media: 'blank80', fault: { kind: 'none' }, fast: false }
      case 'start':
      case 'status':
      case 'cancel':
      case 'close':
      case 'setSimSettings':
      case 'reveal':
      case 'saveLog':
        throw new Error(`The fake core doesn't burn (${request.op})`)
    }
  },
  reset: () => {
    Object.assign(state, initialState())
  },
  setDevices: (devices: DevicesAnswer) => {
    state.devices = devices
  },
}
