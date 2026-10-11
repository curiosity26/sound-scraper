import type { WaveformStatus } from '@/native/bridge'
import {
  isBoolean,
  isNullable,
  isNumber,
  isOneOf,
  isShape,
  isString,
} from '@/utils/guards'

import { isVariantOf } from './isVariantOf'

type Variant<S extends WaveformStatus['state']> = Extract<
  WaveformStatus,
  { state: S }
>

export const isWaveformStatus = isVariantOf<WaveformStatus, 'state'>('state', {
  loading: isShape<Variant<'loading'>>({
    state: isOneOf('loading'),
    progress: isNumber,
  }),
  ready: isShape<Variant<'ready'>>({
    state: isOneOf('ready'),
    rate: isNumber,
    durationMs: isNumber,
    frameMs: isNullable(isNumber),
    frameOffsetMs: isNullable(isNumber),
    master: isBoolean,
  }),
  failed: isShape<Variant<'failed'>>({
    state: isOneOf('failed'),
    message: isString,
  }),
})
