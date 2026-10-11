import type { ResolvedFrame } from '@/native/bridge'
import { isShape } from '@/utils/guards'

import { isImageRef } from './isImageRef'
import { isRect } from './isRect'

export const isResolvedFrame = isShape<ResolvedFrame>({
  image: isImageRef,
  slice: isRect,
})
