// The core's native module (src/bridge/NativeSoundScraper.ts), faked: an
// in-memory recordings folder, settings, recorder, player and playlists that
// behave like the core, so the app's own code runs for real on top. Tests
// replace the module with this one:
//
//   vi.mock('@/bridge/NativeSoundScraper', () => import('@test/fakes/NativeSoundScraper'))
//
// and arrange or inspect it through `fakeCore`. Call `fakeCore.reset()` in a
// beforeEach.
import { vi } from 'vitest'

import type {
  BurnRequest,
  Playlist,
  PlaylistItem,
  PlaylistsAnswer,
  PlaylistsRequest,
  StoredSettings,
} from '@/bridge/generated'
import type {
  AudioApp,
  RecorderEvent,
  Recording,
  Spec,
  TagEdit,
  Tags,
} from '@/bridge/NativeSoundScraper'
import { parseNative } from '@/bridge/parseNative'
import { isShape, isString } from '@/shared/utils/guards'

import { fakeEmitter } from './emitter'
import { type BurnAnswer, fakeBurner } from './fakeBurner'

export const emptyTags: Tags = {
  title: null,
  artist: null,
  album: null,
  albumArtist: null,
  date: null,
  genre: null,
  comment: null,
  track: null,
  coverPath: null,
}

export const defaultSettings: StoredSettings = {
  effectiveRecordingsDir: '/Users/me/Music/Sound Scraper',
  version: 1,
  recordingsDir: null,
  quality: 'cbr192',
  id3Version: '2.4',
  lastSource: null,
  skin: null,
  doubleSize: false,
  trimSilence: true,
  keepMasters: true,
  masterMinMinutes: 20,
  masterBudgetGb: 10,
  masterMaxAgeDays: 30,
}

/** A recording in the fake folder; `title` defaults to the file's name. */
export const recording = (
  fileName: string,
  extra: Partial<Recording> = {},
): Recording => ({
  fileName,
  path: `/Users/me/Music/Sound Scraper/${fileName}`,
  title: fileName.replace(/\.mp3$/, ''),
  artist: null,
  album: null,
  durationMs: 60_000,
  sizeBytes: 1_000_000,
  recordedAtMs: 0,
  ...extra,
})

type PlaylistRecord = { id: number; name: string; items: PlaylistItem[] }

type State = {
  recordings: Recording[]
  tags: Record<string, Tags>
  settings: StoredSettings
  apps: AudioApp[]
  recorder: string
  player: { state: string; path: string | null; positionMs: number }
  playlists: PlaylistRecord[]
  activePlaylist: number | null
  nextId: number
  /** What the next file or image dialog answers (null = cancelled). */
  pick: string | null
}

const initialState = (): State => ({
  recordings: [],
  tags: {},
  settings: defaultSettings,
  apps: [],
  recorder: 'idle',
  player: { state: 'empty', path: null, positionMs: 0 },
  playlists: [],
  activePlaylist: null,
  nextId: 1,
  pick: null,
})

const state: State = initialState()
const recorderEvents = fakeEmitter<RecorderEvent>('fake:recorderEvent')
const libraryEvents = fakeEmitter<string>('fake:libraryChanged')

const recorderEvent = (event: Partial<RecorderEvent>): RecorderEvent => ({
  kind: 'state',
  state: state.recorder,
  elapsedMs: 0,
  peak: 0,
  rms: 0,
  path: null,
  message: null,
  playerState: state.player.state,
  positionMs: state.player.positionMs,
  durationMs: durationOf(state.player.path),
  ...event,
})

const durationOf = (path: string | null) =>
  state.recordings.find(r => r.path === path)?.durationMs ?? 0

const setRecorder = (next: string) => {
  state.recorder = next
  recorderEvents.emit(recorderEvent({ kind: 'state' }))
}

const setPlayer = (next: string, positionMs = state.player.positionMs) => {
  state.player = { ...state.player, state: next, positionMs }
  recorderEvents.emit(recorderEvent({ kind: 'playerState' }))
}

const libraryChanged = () => {
  libraryEvents.emit('changed')
}

type Answer = PlaylistsAnswer | BurnAnswer

// The app sends well-formed requests; the fake only checks there's an op.
const hasOp = isShape<{ op: string }>({ op: isString })
const isPlaylistsRequest = (value: unknown): value is PlaylistsRequest =>
  hasOp(value)
const isBurnRequest = (value: unknown): value is BurnRequest => hasOp(value)

const isPartialSettings = (value: unknown): value is Partial<StoredSettings> =>
  typeof value === 'object' && value !== null

const summary = (p: PlaylistRecord): Playlist => ({
  id: p.id,
  name: p.name,
  count: p.items.length,
})

const playlistNamed = (id: number) => {
  const found = state.playlists.find(p => p.id === id)
  if (!found) {
    throw new Error(`No playlist ${String(id)}`)
  }
  return found
}

const newItems = (fileNames: readonly string[]) =>
  fileNames.map(fileName => ({ id: state.nextId++, fileName }))

/** ss_playlists, in memory. */
const playlistsRequest = (request: PlaylistsRequest): PlaylistsAnswer => {
  switch (request.op) {
    case 'list':
      return state.playlists.map(summary)
    case 'items':
      return playlistNamed(request.id).items
    case 'create': {
      const created = {
        id: state.nextId++,
        name: request.name,
        items: newItems(request.fileNames ?? []),
      }
      state.playlists = [...state.playlists, created]
      return summary(created)
    }
    case 'rename':
      playlistNamed(request.id).name = request.name
      return null
    case 'duplicate': {
      const from = playlistNamed(request.id)
      const copy = {
        id: state.nextId++,
        name: `${from.name} copy`,
        items: newItems(from.items.map(i => i.fileName)),
      }
      state.playlists = [...state.playlists, copy]
      return summary(copy)
    }
    case 'delete':
      state.playlists = state.playlists.filter(p => p.id !== request.id)
      return null
    case 'add': {
      const p = playlistNamed(request.id)
      p.items = [...p.items, ...newItems(request.fileNames)]
      return null
    }
    case 'remove': {
      const p = playlistNamed(request.id)
      p.items = p.items.filter(i => !request.itemIds.includes(i.id))
      return null
    }
    case 'setOrder': {
      const p = playlistNamed(request.id)
      p.items = request.itemIds.flatMap(id => p.items.filter(i => i.id === id))
      return null
    }
    case 'active':
      return state.activePlaylist
    case 'setActive':
      state.activePlaylist = request.id
      return null
    case 'exportM3u8':
      return { missing: 0 }
  }
}

/** Runs `answer`, wrapping it in the core's {"ok"} / {"error"} reply. */
const reply = (answer: () => Answer) => {
  try {
    return JSON.stringify({ ok: answer() })
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : 'failed' })
  }
}

const applyEdit = (tags: Tags, edit: TagEdit): Tags => {
  const changed = Object.fromEntries(
    Object.entries(edit).filter(([key]) => edit.fields.includes(key)),
  )
  const cover =
    edit.cover === 'keep'
      ? tags.coverPath
      : edit.cover === 'set'
      ? edit.coverPath
      : null
  return { ...tags, ...changed, coverPath: cover }
}

const native = {
  onRecorderEvent: vi.fn(recorderEvents.on),
  onLibraryChanged: vi.fn(libraryEvents.on),
  getVersion: vi.fn(() => '0.0.0-test'),
  listAudioApps: vi.fn(() => state.apps),
  recordTestWav: vi.fn(() => Promise.reject(new Error('Not in tests'))),
  recorderStart: vi.fn((_appPid: number) => {
    setRecorder('recording')
    return Promise.resolve()
  }),
  recorderPause: vi.fn(() => {
    setRecorder('paused')
  }),
  recorderResume: vi.fn(() => {
    setRecorder('recording')
  }),
  recorderStop: vi.fn(() => {
    setRecorder('idle')
    return Promise.resolve(`${state.settings.effectiveRecordingsDir}/New.mp3`)
  }),
  recorderState: vi.fn(() => state.recorder),
  recoverPartialRecordings: vi.fn(() => 0),
  playerLoad: vi.fn((path: string) => {
    state.player = { state: 'stopped', path, positionMs: 0 }
    recorderEvents.emit(recorderEvent({ kind: 'playerState' }))
    return Promise.resolve()
  }),
  playerUnload: vi.fn(() => {
    state.player = { state: 'empty', path: null, positionMs: 0 }
    recorderEvents.emit(recorderEvent({ kind: 'playerState' }))
  }),
  playerPlay: vi.fn(() => {
    setPlayer('playing')
    return Promise.resolve()
  }),
  playerPause: vi.fn(() => {
    setPlayer('paused')
  }),
  playerStop: vi.fn(() => {
    setPlayer('stopped', 0)
  }),
  playerSeek: vi.fn((positionMs: number) => {
    setPlayer(state.player.state, positionMs)
  }),
  playerState: vi.fn(() => state.player.state),
  listRecordings: vi.fn(() => Promise.resolve([...state.recordings])),
  renameRecording: vi.fn((fileName: string, newName: string) => {
    const renamed = `${newName}.mp3`
    state.recordings = state.recordings.map(r =>
      r.fileName === fileName
        ? { ...r, fileName: renamed, path: r.path.replace(fileName, renamed) }
        : r,
    )
    const { [fileName]: tags, ...rest } = state.tags
    state.tags = tags ? { ...rest, [renamed]: tags } : rest
    libraryChanged()
    return Promise.resolve(renamed)
  }),
  trashRecording: vi.fn((fileName: string) => {
    state.recordings = state.recordings.filter(r => r.fileName !== fileName)
    libraryChanged()
    return Promise.resolve()
  }),
  revealRecording: vi.fn((_fileName: string) => {}),
  readTags: vi.fn((fileName: string) =>
    Promise.resolve(state.tags[fileName] ?? emptyTags),
  ),
  writeTags: vi.fn((fileNames: string[], edit: TagEdit) => {
    fileNames.forEach(fileName => {
      state.tags = {
        ...state.tags,
        [fileName]: applyEdit(state.tags[fileName] ?? emptyTags, edit),
      }
    })
    libraryChanged()
    return Promise.resolve()
  }),
  pickImage: vi.fn(() => Promise.resolve(state.pick)),
  getSettings: vi.fn(() => JSON.stringify(state.settings)),
  setSettings: vi.fn((json: string) => {
    state.settings = {
      ...state.settings,
      ...parseNative(json, isPartialSettings, 'settings'),
    }
    return Promise.resolve()
  }),
  pickFolder: vi.fn(() => Promise.resolve(state.pick)),
  playlists: vi.fn((json: string) =>
    reply(() =>
      playlistsRequest(parseNative(json, isPlaylistsRequest, 'request')),
    ),
  ),
  burn: vi.fn((json: string) =>
    reply(() =>
      fakeBurner.request(parseNative(json, isBurnRequest, 'request')),
    ),
  ),
  pickSaveFile: vi.fn(
    (_title: string, _defaultName: string, _extension: string) =>
      Promise.resolve(state.pick),
  ),
} satisfies Spec

export const NativeSoundScraper = native

/** The test's handle on the fake core. */
export const fakeCore = {
  native,
  /** Back to an empty folder, default settings and nothing playing. */
  reset: () => {
    Object.assign(state, initialState())
    fakeBurner.reset()
    Object.values(native).forEach(fn => {
      fn.mockClear()
    })
  },
  /** Puts recordings (with optional tags) in the folder. */
  setRecordings: (
    recordings: readonly Recording[],
    tags: Record<string, Partial<Tags>> = {},
  ) => {
    state.recordings = [...recordings]
    state.tags = Object.fromEntries(
      Object.entries(tags).map(([file, t]) => [file, { ...emptyTags, ...t }]),
    )
    libraryChanged()
  },
  recordings: (): readonly Recording[] => state.recordings,
  tagsOf: (fileName: string): Tags => state.tags[fileName] ?? emptyTags,
  setSettings: (settings: Partial<StoredSettings>) => {
    state.settings = { ...state.settings, ...settings }
  },
  settings: (): StoredSettings => state.settings,
  setApps: (apps: readonly AudioApp[]) => {
    state.apps = [...apps]
  },
  /** What the next file, folder or image dialog answers. */
  setPick: (path: string | null) => {
    state.pick = path
  },
  /** Adds a playlist; returns its id. */
  addPlaylist: (name: string, fileNames: readonly string[] = []) => {
    const created = { id: state.nextId++, name, items: newItems(fileNames) }
    state.playlists = [...state.playlists, created]
    return created.id
  },
  /** A playlist's file names, in its order. */
  playlistFiles: (id: number): readonly string[] =>
    playlistNamed(id).items.map(i => i.fileName),
  /** Sends a recorder or player event, as the core does while running. */
  emit: (event: Partial<RecorderEvent>) => {
    recorderEvents.emit(recorderEvent(event))
  },
}
