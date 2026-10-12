import type { Recording } from '@/bridge/types'
import type { EditorTarget } from '@/features/editor/components/EditorPanel'

import { displayName } from './displayName'

/** What the track editor needs to open `recording`. */
export const editorTargetOf = (recording: Recording): EditorTarget => ({
  fileName: recording.fileName,
  path: recording.path,
  title: displayName(recording),
  durationMs: recording.durationMs,
})
