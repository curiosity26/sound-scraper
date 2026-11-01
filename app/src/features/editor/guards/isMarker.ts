import type { Marker } from '@/bridge/generated'
import { isBoolean, isNumber, isShape, isString } from '@/shared/utils/guards'

import { isTrackTags } from './isTrackTags'

export const isMarker = isShape<Marker>({
  atMs: isNumber,
  title: isString,
  tags: isTrackTags,
  partial: isBoolean,
  ad: isBoolean,
  unsnapped: isBoolean,
})
