import type { ImageRef } from '@/native/bridge'
import { isNullable, isNumber, isShape, isString } from '@/utils/guards'

export const isImageRef = isShape<ImageRef>({
  path: isString,
  path2x: isNullable(isString),
  path4x: isNullable(isString),
  width: isNumber,
  height: isNumber,
})
