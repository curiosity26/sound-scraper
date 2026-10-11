// Playlist rows, reordering and the audio-CD capacity check
// (docs/playlists-and-cd-burning-design.md §4, §5). Pure, so it's unit-tested.
import type { PlaylistItem } from '@/native/bridge'
import type { Recording } from '@/native/types'

/** One row of a playlist: its item, and the recording unless it's missing. */
export type PlaylistRow = {
  item: PlaylistItem
  /** 1-based place in the playlist. */
  position: number
  recording?: Recording
}

export type DiscFit = 'empty' | 'fits74' | 'fits80' | 'tooLong' | 'tooMany'

export type Capacity = {
  tracks: number
  /** Everything on the disc: pregap, tracks and gaps. */
  totalSectors: number
  /** Just the gaps (including track 1's pregap). */
  gapSectors: number
  fit: DiscFit
  /** Free on the smallest disc it fits, or over 80 minutes when negative. */
  spareSectors: number
  /**
   * Index (in the rows given) of the first track that runs past an 80-minute
   * disc, or -1.
   */
  firstOver: number
  /** Rows left out because their recording is missing. */
  missing: number
}

/** Native pop-up menu at (x, y) in the panel; resolves with the index or -1. */
export type ShowCheckedMenu = (
  items: string[],
  checked: number,
  x: number,
  y: number,
) => Promise<number>
