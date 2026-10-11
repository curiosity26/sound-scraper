import type { EditorTrack } from '@/native/bridge'
import { isBoolean, isNumber, isShape, isString } from '@/utils/guards'

export const isEditorTrack = isShape<EditorTrack>({
  name: isString,
  startMs: isNumber,
  durationMs: isNumber,
  reencode: isBoolean,
})
