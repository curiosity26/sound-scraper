import type { ResolvedClose } from '@/native/bridge'
import { isShape } from '@/utils/guards'

import { isNumberPair } from './isNumberPair'
import { isResolvedSprite } from './isResolvedSprite'

export const isResolvedClose = isShape<ResolvedClose>({
  offset: isNumberPair,
  size: isNumberPair,
  sprite: isResolvedSprite,
})
