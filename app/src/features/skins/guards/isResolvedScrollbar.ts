import type { ResolvedScrollbar } from '@/bridge/generated'
import { isNullable, isShape } from '@/shared/utils/guards'

import { isImageRef } from './isImageRef'
import { isRect } from './isRect'

export const isResolvedScrollbar = isShape<ResolvedScrollbar>({
  image: isImageRef,
  track: isRect,
  thumb: isRect,
  thumbSlice: isNullable(isRect),
})
