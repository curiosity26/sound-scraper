import type { RecorderState } from '@/bridge/types'
import { isUnionOf } from '@/shared/utils/guards/isUnionOf'

/** The codegen spec types the recorder's state as a string. */
export const isRecorderState = isUnionOf<RecorderState>()(
  'idle',
  'recording',
  'paused',
  'finalizing',
)
