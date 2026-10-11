import type { ResolvedFont } from '@/native/bridge'
import { isNumber, isShape, isString } from '@/utils/guards'

import { isImageRef } from './isImageRef'
import { isNumberPair } from './isNumberPair'

export const isResolvedFont = isShape<ResolvedFont>({
  image: isImageRef,
  glyphs: isString,
  cell: isNumberPair,
  columns: isNumber,
})
