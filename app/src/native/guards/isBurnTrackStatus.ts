import type { BurnTrackStatus } from '@/native/bridge'
import { isNumber, isShape, isString } from '@/utils/guards'

import { isUnionOf } from './isUnionOf'

export const isBurnTrackStatus = isShape<BurnTrackStatus>({
  title: isString,
  durationMs: isNumber,
  state: isUnionOf<BurnTrackStatus['state']>()(
    'waiting',
    'preparing',
    'ready',
    'writing',
    'done',
    'failed',
  ),
  progress: isNumber,
})
