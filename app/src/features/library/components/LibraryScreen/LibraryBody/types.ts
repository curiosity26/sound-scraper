import type { Recording } from '@/bridge/types'
import type { PlaylistsState } from '@/features/playlists/playlists'

import type { UseCheckedRowsResult } from './useCheckedRows'
import type { UseShownPlaylistResult } from './useShownPlaylist'

/**
 * What the library shows once it's read, shared by LibraryBody's parts
 * (LibraryViewContext): the recordings, the playlists, the playlist showing
 * and the checked rows.
 */
export type LibraryView = {
  readonly recordings: readonly Recording[]
  readonly playlistsState: PlaylistsState
  readonly shown: UseShownPlaylistResult
  readonly checks: UseCheckedRowsResult
}

/** The in-panel prompt: name a playlist, confirm a delete, or duplicates. */
export type Prompt =
  | {
      kind: 'name'
      title: string
      value: string
      onDone: (name: string) => void
    }
  | {
      kind: 'confirm'
      title: string
      body: string
      action: string
      onDone: () => void
    }
  | {
      kind: 'duplicates'
      playlistId: number
      playlistName: string
      fileNames: readonly string[]
      already: number
    }

/** The prompt showing (PlaylistPromptContext), and how to change it. */
export type PlaylistPromptState = {
  readonly prompt: Prompt | null
  readonly setPrompt: (prompt: Prompt | null) => void
}
