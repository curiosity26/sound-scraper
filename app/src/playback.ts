// The recording loaded for playback, shared by the main panel and the
// library (separate windows on one JS runtime). Selecting one recording in
// the library loads it; recording something new unloads it.
import { useEffect, useState } from 'react'

import { errorText } from './appHelpers'
import {
  library,
  player,
  type PlayerState,
  recorder,
  type Recording,
} from './native/SoundScraper'
import { selection } from './selection'
import { type Levels, SILENT } from './levels'

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

function update(change: Partial<Playback>) {
  current = { ...current, ...change }
  listeners.forEach(l => l(current))
}

function reportError(message: string) {
  errorListeners.forEach(l => l(message))
}

function subscribeNative() {
  if (subscribed) {
    return
  }
  subscribed = true
  recorder.onEvent(e => {
    switch (e.kind) {
      case 'playerState': {
        const state = e.playerState as PlayerState
        const ended =
          current.state === 'playing' && state === 'stopped' && !expectingStop
        expectingStop = false
        if (state === 'empty') {
          update(EMPTY)
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
          endedListeners.forEach(l => l(fileName))
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
        reportError(`Playback failed: ${e.message}`)
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
      update(EMPTY)
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
      update(EMPTY)
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
  pause: () => player.pause(),
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

/** The current playback, re-rendering on changes. */
export function usePlayback(): Playback {
  const [p, setP] = useState(current)
  useEffect(() => {
    setP(playback.get())
    return playback.subscribe(setP)
  }, [])
  return p
}
