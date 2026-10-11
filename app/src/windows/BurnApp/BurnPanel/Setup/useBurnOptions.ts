import { useMemo, useState } from 'react'

import type { Device, Readiness, Target } from '@/burn/types'
import { discCapacity } from '@/playlists/discCapacity'
import type { Capacity, PlaylistRow } from '@/playlists/types'

import { fitLine } from './fitLine'
import { readiness } from './readiness'

type Options = ReadonlyArray<readonly [string, string]>

export type UseBurnOptionsResult = {
  /** Seconds between tracks. */
  readonly gap: number
  readonly setGap: (gap: number) => void
  readonly cdText: boolean
  readonly setCdText: (on: boolean) => void
  readonly testWrite: boolean
  readonly setTestWrite: (on: boolean) => void
  readonly eject: boolean
  readonly setEject: (on: boolean) => void
  /** Write speed; 0 is the drive's maximum. */
  readonly speed: number
  readonly setSpeed: (speed: number) => void
  readonly capacity: Capacity
  /** How long it runs and whether it fits the disc. */
  readonly fit: string
  readonly ready: Readiness
  /** A real (or simulated) drive, not the image writer. */
  readonly isDrive: boolean
  /** The speed choices, when the drive offers any. */
  readonly speedOptions: Options | null
  readonly gapOptions: Options
  /** Whether the CD-Text, test write and eject options apply. */
  readonly showCdText: boolean
  readonly showTestWrite: boolean
  readonly showEject: boolean
  /** The burn button's label. */
  readonly action: string
}

/** Rows the capacity math wants, from the burn target's tracks. */
const rowsOf = (target: Target): PlaylistRow[] =>
  target.tracks.map((t, i) => ({
    item: { id: i, fileName: t.path },
    position: i + 1,
    recording: {
      fileName: t.path,
      path: t.path,
      title: t.title,
      artist: t.performer,
      album: null,
      durationMs: t.durationMs,
      sizeBytes: 0,
      recordedAtMs: 0,
    },
  }))

/**
 * The burn options for `target` on `device`, and what follows from them:
 * whether it fits, whether it can start, and which options apply.
 */
export const useBurnOptions = (
  target: Target,
  device: Device | undefined,
): UseBurnOptionsResult => {
  const [gap, setGap] = useState(2)
  const [cdText, setCdText] = useState(true)
  const [testWrite, setTestWrite] = useState(false)
  const [eject, setEject] = useState(true)
  const [speed, setSpeed] = useState(0)

  const capacity = useMemo(
    () => discCapacity(rowsOf(target), gap),
    [target, gap],
  )
  const ready = readiness(device, capacity)
  const isDrive = device !== undefined && device.kind !== 'image'
  const gapless = device?.gapless ?? true

  return {
    gap,
    setGap,
    cdText,
    setCdText,
    testWrite,
    setTestWrite,
    eject,
    setEject,
    speed,
    setSpeed,
    capacity,
    fit: fitLine(device, capacity),
    ready,
    isDrive,
    speedOptions:
      isDrive && device.speeds.length > 0
        ? [
            ['0', 'Maximum'],
            ...device.speeds.map((s): readonly [string, string] => [
              String(s),
              `${s}x`,
            ]),
          ]
        : null,
    gapOptions: gapless
      ? [
          ['2', '2 seconds'],
          ['0', 'None (gapless)'],
        ]
      : [['2', '2 seconds']],
    showCdText: device?.cdText ?? true,
    showTestWrite: device?.canTest ?? false,
    showEject: isDrive,
    action: testWrite && device?.canTest ? 'Test' : ready.action,
  }
}
