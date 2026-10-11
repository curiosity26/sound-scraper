import type { ResolvedElement } from '@/native/bridge'
import { isUnionOf } from '@/native/guards/isUnionOf'
import {
  isBoolean,
  isNullable,
  isRecordOf,
  isShape,
  isString,
} from '@/utils/guards'

import { isJsonValue } from './isJsonValue'
import { isRect } from './isRect'
import { isResolvedSprite } from './isResolvedSprite'
import { isResolvedText } from './isResolvedText'

type Align = NonNullable<ResolvedElement['align']>

export const isResolvedElement = isShape<ResolvedElement>({
  rect: isRect,
  sprite: isNullable(isResolvedSprite),
  font: isNullable(isString),
  text: isNullable(isResolvedText),
  align: isNullable(isUnionOf<Align>()('left', 'center', 'right')),
  style: isNullable(isRecordOf(isJsonValue)),
  fallback: isBoolean,
})
