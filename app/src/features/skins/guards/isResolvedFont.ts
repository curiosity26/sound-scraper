import type { ResolvedFont } from '@/bridge/generated'
import { isNumber, isShape, isString } from '@/shared/utils/guards'

import { isImageRef } from './isImageRef'
import { isNumberPair } from './isNumberPair'

export const isResolvedFont = isShape<ResolvedFont>({
  image: isImageRef,
  glyphs: isString,
  cell: isNumberPair,
  columns: isNumber,
})
