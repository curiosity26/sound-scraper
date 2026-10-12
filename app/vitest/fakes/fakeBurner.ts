// The core's CD burner (ss_burn), faked for the fake core
// (./NativeSoundScraper.ts): the devices are arranged by the test, and so is
// the status of the burn jobs started (each starts out preparing).
import type {
  BurnOptions,
  BurnRequest,
  BurnStatus,
  DevicesAnswer,
  SimSettings,
} from '@/bridge/generated'

export type BurnAnswer =
  | DevicesAnswer
  | SimSettings
  | BurnStatus
  | number
  | null

/** A burn job's status; preparing, with nothing done yet, unless changed. */
export const burnStatus = (extra: Partial<BurnStatus> = {}): BurnStatus => ({
  state: 'preparing',
  phase: 'Preparing',
  destination: 'Drive',
  kind: 'drive',
  tracks: [],
  overall: 0,
  elapsedMs: 0,
  remainingMs: null,
  speedX: null,
  buffer: null,
  log: [],
  message: null,
  output: null,
  testWrite: false,
  ...extra,
})

type Job = { id: number; options: BurnOptions; status: BurnStatus }

type State = {
  devices: DevicesAnswer
  jobs: Job[]
  /** Every burn started, closed ones too. */
  started: BurnOptions[]
  nextJobId: number
  /** What jobs report: set by the test, or per job when unset. */
  status: BurnStatus | null
}

const initialState = (): State => ({
  devices: { devices: [], simulator: false },
  jobs: [],
  started: [],
  nextJobId: 1,
  status: null,
})

const state: State = initialState()

const jobNumbered = (id: number) => {
  const found = state.jobs.find(j => j.id === id)
  if (!found) {
    throw new Error(`No burn job ${String(id)}`)
  }
  return found
}

const start = ({ op: _, ...options }: BurnOptions & { op: 'start' }) => {
  const job = {
    id: state.nextJobId++,
    options,
    status: burnStatus({
      tracks: options.tracks.map(t => ({
        title: t.title,
        durationMs: t.durationMs ?? 0,
        state: 'waiting',
        progress: 0,
      })),
    }),
  }
  state.jobs = [...state.jobs, job]
  state.started = [...state.started, options]
  return job.id
}

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
        return start(request)
      case 'status':
        return state.status ?? jobNumbered(request.id).status
      case 'cancel': {
        const job = jobNumbered(request.id)
        job.status = { ...job.status, state: 'cancelled' }
        state.status = state.status && { ...state.status, state: 'cancelled' }
        return null
      }
      case 'close':
        state.jobs = state.jobs.filter(j => j.id !== request.id)
        return null
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
  /** The options of each burn started, oldest first (closed ones too). */
  started: (): readonly BurnOptions[] => state.started,
  /** What every burn job reports from now on, as the core would. */
  setStatus: (status: BurnStatus) => {
    state.status = status
  },
}
