import type { SavedTracks } from '@/native/bridge'
import {
  isArrayOf,
  isBoolean,
  isNumber,
  isShape,
  isString,
} from '@/utils/guards'

export const isSavedTracks = isShape<SavedTracks>({
  files: isArrayOf(isString),
  reencoded: isNumber,
  fromMaster: isBoolean,
})
