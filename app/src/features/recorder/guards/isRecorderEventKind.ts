import type { RecorderEventKind } from '@/bridge/types'
import { isUnionOf } from '@/shared/utils/guards/isUnionOf'

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
