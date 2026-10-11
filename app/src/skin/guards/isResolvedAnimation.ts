import type { ResolvedAnimation } from '@/native/bridge'
import { isUnionOf } from '@/native/guards/isUnionOf'
import {
  isArrayOf,
  isNullable,
  isNumber,
  isShape,
  isString,
} from '@/utils/guards'

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
