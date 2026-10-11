import type { ResolvedText } from '@/native/bridge'
import { isUnionOf } from '@/native/guards/isUnionOf'
import {
  isBoolean,
  isNullable,
  isNumber,
  isShape,
  isString,
} from '@/utils/guards'

type Weight = NonNullable<ResolvedText['weight']>

export const isResolvedText = isShape<ResolvedText>({
  color: isNullable(isString),
  size: isNullable(isNumber),
  family: isNullable(isString),
  weight: isNullable(isUnionOf<Weight>()('normal', 'bold')),
  uppercase: isBoolean,
})
