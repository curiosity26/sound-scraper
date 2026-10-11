import type { SkinSummary } from '@/native/bridge'
import { isBoolean, isNullable, isShape, isString } from '@/utils/guards'

export const isSkinSummary = isShape<SkinSummary>({
  id: isString,
  name: isString,
  author: isNullable(isString),
  version: isNullable(isString),
  dir: isString,
  builtin: isBoolean,
  error: isNullable(isString),
})
