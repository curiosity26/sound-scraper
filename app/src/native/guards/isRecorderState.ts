import type { RecorderState } from '@/native/types'

import { isUnionOf } from './isUnionOf'

/** The codegen spec types the recorder's state as a string. */
export const isRecorderState = isUnionOf<RecorderState>()(
  'idle',
  'recording',
  'paused',
  'finalizing',
)
