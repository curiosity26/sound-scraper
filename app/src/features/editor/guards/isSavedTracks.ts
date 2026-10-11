import type { SavedTracks } from '@/bridge/generated'
import {
  isArrayOf,
  isBoolean,
  isNumber,
  isShape,
  isString,
} from '@/shared/utils/guards'

export const isSavedTracks = isShape<SavedTracks>({
  files: isArrayOf(isString),
  reencoded: isNumber,
  fromMaster: isBoolean,
})
