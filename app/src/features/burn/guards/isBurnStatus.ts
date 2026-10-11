import type { BurnStatus } from '@/bridge/generated'
import {
  isArrayOf,
  isBoolean,
  isNullable,
  isNumber,
  isShape,
  isString,
} from '@/shared/utils/guards'
import { isUnionOf } from '@/shared/utils/guards/isUnionOf'

import { isBurnLogLine } from './isBurnLogLine'
import { isBurnTrackStatus } from './isBurnTrackStatus'

export const isBurnStatus = isShape<BurnStatus>({
  state: isUnionOf<BurnStatus['state']>()(
    'preparing',
    'writing',
    'done',
    'failed',
    'cancelled',
  ),
  phase: isString,
  destination: isString,
  kind: isString,
  tracks: isArrayOf(isBurnTrackStatus),
  overall: isNumber,
  elapsedMs: isNumber,
  remainingMs: isNullable(isNumber),
  speedX: isNullable(isNumber),
  buffer: isNullable(isNumber),
  log: isArrayOf(isBurnLogLine),
  message: isNullable(isString),
  output: isNullable(isString),
  testWrite: isBoolean,
})
