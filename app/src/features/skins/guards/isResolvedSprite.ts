import type { ResolvedSprite } from '@/bridge/generated'
import { isRecordOf, isShape } from '@/shared/utils/guards'

import { isImageRef } from './isImageRef'
import { isNumberPair } from './isNumberPair'

export const isResolvedSprite = isShape<ResolvedSprite>({
  image: isImageRef,
  states: isRecordOf(isNumberPair),
})
