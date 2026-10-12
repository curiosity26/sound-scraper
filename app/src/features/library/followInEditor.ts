import type { Recording } from '@/bridge/types'
import { editorTarget } from '@/features/editor/editorTarget'

import { editorTargetOf } from './editorTargetOf'

/**
 * With the track editor open, a recording chosen in the library opens in it
 * in place of the one there (whose edits stay a draft).
 */
export const followInEditor = (recording: Recording): void => {
  const open = editorTarget.get()
  if (open && open.path !== recording.path) {
    editorTarget.set(editorTargetOf(recording))
  }
}
