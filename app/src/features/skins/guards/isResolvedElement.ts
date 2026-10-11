import type { ResolvedElement } from '@/bridge/generated'
import {
  isBoolean,
  isNullable,
  isRecordOf,
  isShape,
  isString,
} from '@/shared/utils/guards'
import { isUnionOf } from '@/shared/utils/guards/isUnionOf'

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
