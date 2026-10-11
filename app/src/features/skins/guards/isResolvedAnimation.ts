import type { ResolvedAnimation } from '@/bridge/generated'
import {
  isArrayOf,
  isNullable,
  isNumber,
  isShape,
  isString,
} from '@/shared/utils/guards'
import { isUnionOf } from '@/shared/utils/guards/isUnionOf'

import { isRect } from './isRect'
import { isResolvedSprite } from './isResolvedSprite'

export const isResolvedAnimation = isShape<ResolvedAnimation>({
  name: isNullable(isString),
  rect: isRect,
  sprite: isResolvedSprite,
  frames: isArrayOf(isString),
  fps: isNumber,
  play: isUnionOf<ResolvedAnimation['play']>()(
    'recording',
    'playing',
    'rolling',
    'active',
    'always',
  ),
  speed: isUnionOf<ResolvedAnimation['speed']>()('constant', 'level'),
})
