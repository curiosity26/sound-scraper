import type { DevicesAnswer } from '@/bridge/generated'
import { isArrayOf, isBoolean, isShape } from '@/shared/utils/guards'

import { isDevice } from './isDevice'

export const isDevicesAnswer = isShape<DevicesAnswer>({
  devices: isArrayOf(isDevice),
  simulator: isBoolean,
})
