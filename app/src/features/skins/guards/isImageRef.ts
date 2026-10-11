import type { ImageRef } from '@/bridge/generated'
import { isNullable, isNumber, isShape, isString } from '@/shared/utils/guards'

export const isImageRef = isShape<ImageRef>({
  path: isString,
  path2x: isNullable(isString),
  path4x: isNullable(isString),
  width: isNumber,
  height: isNumber,
})
