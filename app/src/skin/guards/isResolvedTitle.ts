import type { ResolvedTitle } from '@/native/bridge'
import { isNullable, isShape, isString } from '@/utils/guards'

import { isNumberPair } from './isNumberPair'

export const isResolvedTitle = isShape<ResolvedTitle>({
  font: isNullable(isString),
  offset: isNumberPair,
  color: isNullable(isString),
  background: isNullable(isString),
})
