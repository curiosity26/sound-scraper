import type { Recording, Tags } from '@/bridge/types'

/** What the pane reads for the selected recording(s). */
export type RecordingDetails = {
  /** Each recording's tags, in the selection's order. */
  readonly tags: readonly Tags[]
  /** Their library entries. */
  readonly recordings: readonly Recording[]
}
