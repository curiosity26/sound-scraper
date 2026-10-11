import type { ResolvedTitle } from '@/bridge/generated'
import { isNullable, isShape, isString } from '@/shared/utils/guards'

import { isNumberPair } from './isNumberPair'

export const isResolvedTitle = isShape<ResolvedTitle>({
  font: isNullable(isString),
  offset: isNumberPair,
  color: isNullable(isString),
  background: isNullable(isString),
})
