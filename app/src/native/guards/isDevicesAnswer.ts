import type { DevicesAnswer } from '@/native/bridge'
import { isArrayOf, isBoolean, isShape } from '@/utils/guards'

import { isDevice } from './isDevice'

export const isDevicesAnswer = isShape<DevicesAnswer>({
  devices: isArrayOf(isDevice),
  simulator: isBoolean,
})
