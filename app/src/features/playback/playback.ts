// The recording loaded for playback, shared by the main panel and the
// library (separate windows on one JS runtime). Selecting one recording in
// the library loads it; recording something new unloads it.
import type { PlayerState, Recording } from '@/bridge/types'
import { library } from '@/features/library/library'
import { selection } from '@/features/library/selection'
import { SILENT } from '@/features/recorder/constants'
import { recorder } from '@/features/recorder/recorder'
import type { Levels } from '@/features/recorder/types'
import { errorText } from '@/shared/utils/errorText'

import { isPlayerState } from './guards/isPlayerState'
import { player } from './player'

export type Playback = {
  state: PlayerState
  /** The loaded recording (name inside the recordings folder). */
  fileName?: string
  path?: string
  title?: string
  positionMs: number
  durationMs: number
  levels: Levels
}

const EMPTY: Playback = {
  state: 'empty',
  positionMs: 0,
  durationMs: 0,
  levels: SILENT,
}

let current: Playback = EMPTY
const listeners = new Set<(p: Playback) => void>()
const errorListeners = new Set<(message: string) => void>()
const endedListeners = new Set<(fileName: string) => void>()
let subscribed = false
// Set while a stop, seek or load we asked for is on its way, so a stop
// that comes from the end of the file can be told apart from one the user
// pressed.
let expectingStop = false

const publish = (next: Playback) => {
  current = next
  listeners.forEach(l => {
    l(current)
  })
}

const update = (change: Partial<Playback>) => {
  publish({ ...current, ...change })
}

/** Nothing loaded: drops the recording too, which merging EMPTY would keep. */
const unloaded = () => {
  publish(EMPTY)
}

const reportError = (message: string) => {
  errorListeners.forEach(l => {
    l(message)
  })
}

const subscribeNative = () => {
  if (subscribed) {
    return
  }
  subscribed = true
  recorder.onEvent(e => {
    switch (e.kind) {
      case 'playerState': {
        if (!isPlayerState(e.playerState)) {
          break
        }
        const state = e.playerState
        const ended =
          current.state === 'playing' && state === 'stopped' && !expectingStop
        expectingStop = false
        if (state === 'empty') {
          unloaded()
        } else {
          update({
            state,
            positionMs: e.positionMs,
            durationMs: e.durationMs || current.durationMs,
            levels: state === 'playing' ? current.levels : SILENT,
          })
        }
        if (ended && current.fileName) {
          const fileName = current.fileName
          endedListeners.forEach(l => {
            l(fileName)
          })
        }
        break
      }
      case 'playerProgress':
        update({
          positionMs: e.positionMs,
          durationMs: e.durationMs || current.durationMs,
          levels:
            current.state === 'playing' || current.state === 'paused'
              ? {
                  peak: e.peak,
                  rms: e.rms,
                  left: e.peakLeft ?? e.peak,
                  right: e.peakRight ?? e.peak,
                  rmsLeft: e.rmsLeft ?? e.rms,
                  rmsRight: e.rmsRight ?? e.rms,
                }
              : SILENT,
        })
        break
      case 'playerError':
        reportError(`Playback failed: ${String(e.message)}`)
        break
      case 'state':
      case 'progress':
      case 'finished':
      case 'error':
        // The recorder's events: its hooks follow them.
        break
    }
  })
}

export const playback = {
  get: (): Playback => current,

  /** Loads `recording` unless it's already loaded or a recording runs. */
  select: async (recording: Recording) => {
    subscribeNative()
    if (recorder.state() !== 'idle' || current.path === recording.path) {
      return
    }
    update({
      fileName: recording.fileName,
      path: recording.path,
      title: recording.title,
      positionMs: 0,
      durationMs: recording.durationMs,
    })
    try {
      expectingStop = true
      await player.load(recording.path)
    } catch (e) {
      unloaded()
      reportError(`Couldn't load ${recording.fileName}: ${errorText(e)}`)
    }
  },

  /**
   * Loads and selects a recording that just finished (`path` is the final
   * .mp3, after the recorder went idle).
   */
  recorded: async (path: string) => {
    const fileName = path.split(/[\\/]/).pop() ?? path
    let recording: Recording | undefined
    try {
      recording = (await library.list()).find(r => r.fileName === fileName)
    } catch {
      // Fall back to what the path tells us; the player reports the length.
    }
    selection.set([fileName])
    await playback.select(
      recording ?? {
        fileName,
        path,
        title: fileName.replace(/\.mp3$/i, ''),
        artist: null,
        album: null,
        durationMs: 0,
        sizeBytes: 0,
        recordedAtMs: Date.now(),
      },
    )
  },

  /** Unloads, e.g. when the file went away. */
  clear: () => {
    if (current.path) {
      player.unload()
      unloaded()
    }
  },

  /** Keeps the loaded recording across a rename (its file stays open). */
  renamed: (oldName: string, newName: string) => {
    if (current.fileName === oldName && current.path) {
      const dir = current.path.slice(0, current.path.length - oldName.length)
      update({
        fileName: newName,
        path: dir + newName,
        title:
          current.title === oldName.replace(/\.mp3$/i, '')
            ? newName.replace(/\.mp3$/i, '')
            : current.title,
      })
    }
  },

  play: async () => {
    try {
      await player.play()
    } catch (e) {
      reportError(`Couldn't play: ${errorText(e)}`)
    }
  },
  pause: () => {
    player.pause()
  },
  stop: () => {
    expectingStop = true
    player.stop()
  },
  seek: (positionMs: number) => {
    update({ positionMs })
    player.seek(positionMs)
  },

  subscribe: (listener: (p: Playback) => void): (() => void) => {
    subscribeNative()
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  /** The loaded recording played to its end (not stopped by the user). */
  onEnded: (listener: (fileName: string) => void): (() => void) => {
    subscribeNative()
    endedListeners.add(listener)
    return () => endedListeners.delete(listener)
  },
  onError: (listener: (message: string) => void): (() => void) => {
    errorListeners.add(listener)
    return () => errorListeners.delete(listener)
  },
}
