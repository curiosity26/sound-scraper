import type { Splice } from '@/bridge/generated'
import { isNumber, isOptional, isShape, isString } from '@/shared/utils/guards'

import { isTrackTags } from './isTrackTags'

export const isSplice = isShape<Splice>({
  atMs: isNumber,
  name: isString,
  tags: isOptional(isTrackTags),
})
