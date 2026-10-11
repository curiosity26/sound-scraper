import type { ResolvedMain } from '@/bridge/generated'
import {
  isArrayOf,
  isNullable,
  isRecordOf,
  isShape,
} from '@/shared/utils/guards'

import { isImageRef } from './isImageRef'
import { isNumberPair } from './isNumberPair'
import { isRect } from './isRect'
import { isResolvedAnimation } from './isResolvedAnimation'
import { isResolvedElement } from './isResolvedElement'
import { isResolvedLayout } from './isResolvedLayout'

export const isResolvedMain = isShape<ResolvedMain>({
  shade: isNullable(isResolvedLayout),
  size: isNumberPair,
  background: isNullable(isImageRef),
  dragRegions: isArrayOf(isRect),
  elements: isRecordOf(isResolvedElement),
  animations: isArrayOf(isResolvedAnimation),
})
