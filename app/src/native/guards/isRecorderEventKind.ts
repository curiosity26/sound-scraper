import type { RecorderEventKind } from '@/native/types'

import { isUnionOf } from './isUnionOf'

/** The codegen spec types a recorder event's kind as a string. */
export const isRecorderEventKind = isUnionOf<RecorderEventKind>()(
  'state',
  'progress',
  'finished',
  'error',
  'playerState',
  'playerProgress',
  'playerError',
)
