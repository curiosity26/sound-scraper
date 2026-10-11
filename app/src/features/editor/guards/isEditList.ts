import type { EditList } from '@/bridge/generated'
import { isArrayOf, isShape, isString } from '@/shared/utils/guards'

import { isRegion } from './isRegion'
import { isSplice } from './isSplice'

export const isEditList = isShape<EditList>({
  firstName: isString,
  splices: isArrayOf(isSplice),
  deleted: isArrayOf(isRegion),
})
