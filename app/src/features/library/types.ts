import type { Recording } from '@/bridge/types'
import type { PlaylistRow } from '@/features/playlists/types'

export type SortKey =
  | 'name'
  | 'duration'
  | 'date'
  | 'size'
  | 'artist'
  /** A playlist's own order. */
  | 'position'

export type Sort = { key: SortKey; ascending: boolean }

/** A playlist shown in place of the whole library. */
export type PlaylistView = {
  rows: readonly PlaylistRow[]
  /** The row loaded for playback (a recording can appear twice). */
  playingItemId: number | null
  /** The row shown in the details panel. */
  selectedItemId: number | null
  onSelectItem: (row: PlaylistRow) => void
  /** The new order, every item id. */
  onReorder: (itemIds: readonly number[]) => void
  onRemove: (itemIds: readonly number[]) => void
  /** Index (in `rows`) of the first track past an 80-minute CD, or -1. */
  firstOver: number
}

export type Row = {
  fileName: string
  /** Missing from the library (a playlist row whose file is gone). */
  recording?: Recording
  itemId?: number
  position?: number
  name: string
  /** Index in the playlist's own order. */
  index?: number
}

/** A native pop-up menu at (x, y) in the panel; resolves with the index or -1. */
export type ShowMenu = (
  items: string[],
  x: number,
  y: number,
) => Promise<number>

export type MenuAction = {
  readonly label: string
  readonly run: (x: number, y: number) => void
}

export type MenuContext = {
  /** The recordings the menu acts on. */
  readonly fileNames: readonly string[]
  /** Their library entries (for titles and the editor). */
  readonly recordings: readonly Recording[]
  readonly hasCover: boolean
  readonly showMenu?: ShowMenu
  /** Tags or files changed: refresh what's shown. */
  readonly onChanged: () => void
  /** They went to the Trash. */
  readonly onTrashed?: () => void
  /** A note or an error for the user. */
  readonly report: (message: { text: string; isError: boolean }) => void
  /** Extra actions, shown before the destructive last one. */
  readonly extra?: readonly MenuAction[]
}
