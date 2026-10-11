import type { Media } from '@/native/bridge'
import { isNullable, isNumber, isShape, isString } from '@/utils/guards'

export const isMedia = isShape<Media>({
  state: isString,
  kind: isNullable(isString),
  capacity: isNullable(isNumber),
  label: isString,
})
