// The checked rows (multi-select for bulk edits and "Add to ▾"): file names
// in the library, `#<item id>` in a playlist (see LibraryTable's rowKey).
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react'

import { selection } from '@/library/selection'
import type { Recording } from '@/native/types'
import type { PlaylistRow } from '@/playlists/types'

export type UseCheckedRowsProps = {
  readonly recordings: readonly Recording[]
  /** The playlist showing, if any (null = the library). */
  readonly activeId: number | null
  readonly showing: boolean
  /** The showing playlist's rows. */
  readonly rows: readonly PlaylistRow[]
}

export type UseCheckedRowsResult = {
  readonly checked: Set<string>
  readonly setChecked: Dispatch<SetStateAction<Set<string>>>
  readonly clear: () => void
  /** File names behind the checked rows, each once. */
  readonly checkedNames: readonly string[]
}

export const useCheckedRows = (
  props: UseCheckedRowsProps,
): UseCheckedRowsResult => {
  const { recordings, activeId, showing, rows } = props
  const [checked, setChecked] = useState<Set<string>>(new Set())

  // Switching between the library and a playlist clears the checks.
  useEffect(() => {
    setChecked(new Set())
  }, [activeId])

  // Drop vanished recordings from the checks and the selection.
  useEffect(() => {
    const names = new Set(recordings.map(r => r.fileName))
    if (!showing) {
      setChecked(prev => {
        const next = new Set([...prev].filter(n => names.has(n)))
        return next.size === prev.size ? prev : next
      })
    }
    const current = selection.get()
    if (recordings.length > 0 && current.some(n => !names.has(n))) {
      selection.set(current.filter(n => names.has(n)))
    }
  }, [recordings, showing])

  // File names behind the checked rows (playlist rows are keyed by item).
  const checkedNames = showing
    ? rows
        .filter(r => checked.has(`#${r.item.id}`) && r.recording)
        .map(r => r.item.fileName)
    : [...checked]

  return {
    checked,
    setChecked,
    clear: () => {
      setChecked(new Set())
    },
    checkedNames: [...new Set(checkedNames)],
  }
}
