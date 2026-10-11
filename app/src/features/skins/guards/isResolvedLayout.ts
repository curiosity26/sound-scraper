import type { ResolvedLayout } from '@/bridge/generated'
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

export const isResolvedLayout = isShape<ResolvedLayout>({
  size: isNumberPair,
  background: isNullable(isImageRef),
  dragRegions: isArrayOf(isRect),
  elements: isRecordOf(isResolvedElement),
  animations: isArrayOf(isResolvedAnimation),
})
