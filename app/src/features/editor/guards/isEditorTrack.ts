import type { EditorTrack } from '@/bridge/generated'
import { isBoolean, isNumber, isShape, isString } from '@/shared/utils/guards'

export const isEditorTrack = isShape<EditorTrack>({
  name: isString,
  startMs: isNumber,
  durationMs: isNumber,
  reencode: isBoolean,
})
