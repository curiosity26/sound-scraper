import type { Device } from '@/bridge/generated'
import {
  isArrayOf,
  isBoolean,
  isNumber,
  isShape,
  isString,
} from '@/shared/utils/guards'

import { isMedia } from './isMedia'

export const isDevice = isShape<Device>({
  id: isString,
  name: isString,
  kind: isString,
  media: isMedia,
  speeds: isArrayOf(isNumber),
  canTest: isBoolean,
  gapless: isBoolean,
  cdText: isBoolean,
})
