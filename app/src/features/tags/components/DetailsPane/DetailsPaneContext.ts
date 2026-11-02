import { createContext } from 'react'

import type { UseRecordingDetailsResult } from './useRecordingDetails'

export type DetailsPaneState = UseRecordingDetailsResult & {
  /**
   * One recording, or several for a bulk edit (with a heading, any keys
   * naming what's edited: the fields start over when they change).
   */
  readonly fileNames: readonly string[]
  /**
   * Shown over the fields instead of the file name (and Rename): what the
   * form edits when that isn't recordings on disk, e.g. tracks in a draft.
   */
  readonly heading?: string
  readonly onClose: () => void
  /** No native menus: the actions show as links under the fields. */
  readonly linkActions: boolean
  readonly textStyle: object
  readonly isDark: boolean
}

/**
 * The recording(s) this pane shows (useRecordingDetails) and how it's
 * styled, shared by the pane's parts so each reads what it shows instead of
 * taking it as props.
 */
export const DetailsPaneContext = createContext<DetailsPaneState | null>(null)
