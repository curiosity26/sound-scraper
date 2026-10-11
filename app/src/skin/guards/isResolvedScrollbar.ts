import type { ResolvedScrollbar } from '@/native/bridge'
import { isNullable, isShape } from '@/utils/guards'

import { isImageRef } from './isImageRef'
import { isRect } from './isRect'

export const isResolvedScrollbar = isShape<ResolvedScrollbar>({
  image: isImageRef,
  track: isRect,
  thumb: isRect,
  thumbSlice: isNullable(isRect),
})
