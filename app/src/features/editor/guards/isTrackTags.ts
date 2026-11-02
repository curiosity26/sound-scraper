import type { TrackTags } from '@/bridge/generated'
import { isNumber, isOptional, isShape, isString } from '@/shared/utils/guards'

export const isTrackTags = isShape<TrackTags>({
  artist: isOptional(isString),
  album: isOptional(isString),
  albumArtist: isOptional(isString),
  date: isOptional(isString),
  genre: isOptional(isString),
  comment: isOptional(isString),
  track: isOptional(isNumber),
  cover: isOptional(isString),
})
