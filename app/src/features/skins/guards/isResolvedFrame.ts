import type { ResolvedFrame } from '@/bridge/generated'
import { isShape } from '@/shared/utils/guards'

import { isImageRef } from './isImageRef'
import { isRect } from './isRect'

export const isResolvedFrame = isShape<ResolvedFrame>({
  image: isImageRef,
  slice: isRect,
})
