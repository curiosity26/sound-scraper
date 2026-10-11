import type { SkinSummary } from '@/bridge/generated'
import { isBoolean, isNullable, isShape, isString } from '@/shared/utils/guards'

export const isSkinSummary = isShape<SkinSummary>({
  id: isString,
  name: isString,
  author: isNullable(isString),
  version: isNullable(isString),
  dir: isString,
  builtin: isBoolean,
  error: isNullable(isString),
})
