import type { EditList } from '@/bridge/generated'
import { isArrayOf, isOptional, isShape, isString } from '@/shared/utils/guards'

import { isRegion } from './isRegion'
import { isSplice } from './isSplice'
import { isTrackTags } from './isTrackTags'

export const isEditList = isShape<EditList>({
  firstName: isString,
  firstTags: isOptional(isTrackTags),
  splices: isArrayOf(isSplice),
  deleted: isArrayOf(isRegion),
})
