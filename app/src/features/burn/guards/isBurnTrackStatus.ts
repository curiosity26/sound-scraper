import type { BurnTrackStatus } from '@/bridge/generated'
import { isNumber, isShape, isString } from '@/shared/utils/guards'
import { isUnionOf } from '@/shared/utils/guards/isUnionOf'

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
