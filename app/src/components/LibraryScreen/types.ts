import type { BurnTrackInput } from '@/burn/types'

/** A note or an error for the panel's status line. */
export type OnMessage = (message: { text: string; isError: boolean }) => void

/** Burn CD… / Save CD Image… for the playlist showing. */
export type BurnTarget = {
  playlistId: number
  name: string
  tracks: BurnTrackInput[]
}

/**
 * A right-clicked row: its file name, its item id in a playlist, and the key
 * it's checked under (see LibraryTable's rowKey).
 */
export type RowTarget = { fileName: string; itemId?: number; key: string }
