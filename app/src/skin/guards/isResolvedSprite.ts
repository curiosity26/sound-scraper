import type { ResolvedSprite } from '@/native/bridge'
import { isRecordOf, isShape } from '@/utils/guards'

import { isImageRef } from './isImageRef'
import { isNumberPair } from './isNumberPair'

export const isResolvedSprite = isShape<ResolvedSprite>({
  image: isImageRef,
  states: isRecordOf(isNumberPair),
})
