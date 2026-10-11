import type { ResolvedText } from '@/bridge/generated'
import {
  isBoolean,
  isNullable,
  isNumber,
  isShape,
  isString,
} from '@/shared/utils/guards'
import { isUnionOf } from '@/shared/utils/guards/isUnionOf'

type Weight = NonNullable<ResolvedText['weight']>

export const isResolvedText = isShape<ResolvedText>({
  color: isNullable(isString),
  size: isNullable(isNumber),
  family: isNullable(isString),
  weight: isNullable(isUnionOf<Weight>()('normal', 'bold')),
  uppercase: isBoolean,
})
