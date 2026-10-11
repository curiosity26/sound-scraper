import type { ResolvedClose } from '@/bridge/generated'
import { isShape } from '@/shared/utils/guards'

import { isNumberPair } from './isNumberPair'
import { isResolvedSprite } from './isResolvedSprite'

export const isResolvedClose = isShape<ResolvedClose>({
  offset: isNumberPair,
  size: isNumberPair,
  sprite: isResolvedSprite,
})
