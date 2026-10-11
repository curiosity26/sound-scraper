import type { BurnTrack } from '@/native/bridge'

/** A note or an error for the panel's status line. */
export type OnMessage = (message: { text: string; isError: boolean }) => void

/** Burn CD… / Save CD Image… for the playlist showing. */
export type BurnTarget = {
  playlistId: number
  name: string
  /** The library always knows each track's performer and duration. */
  tracks: Required<BurnTrack>[]
}
