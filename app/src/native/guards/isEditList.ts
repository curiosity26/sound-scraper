import type { EditList } from '@/native/bridge'
import { isArrayOf, isShape, isString } from '@/utils/guards'

import { isRegion } from './isRegion'
import { isSplice } from './isSplice'

export const isEditList = isShape<EditList>({
  firstName: isString,
  splices: isArrayOf(isSplice),
  deleted: isArrayOf(isRegion),
})
