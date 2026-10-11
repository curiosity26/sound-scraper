import type { Media } from '@/bridge/generated'
import { isNullable, isNumber, isShape, isString } from '@/shared/utils/guards'

export const isMedia = isShape<Media>({
  state: isString,
  kind: isNullable(isString),
  capacity: isNullable(isNumber),
  label: isString,
})
