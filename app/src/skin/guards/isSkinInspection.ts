import type { SkinInspection } from '@/native/bridge'
import { isArrayOf, isNullable, isShape, isString } from '@/utils/guards'

import { isSkinSummary } from './isSkinSummary'

export const isSkinInspection = isShape<SkinInspection>({
  id: isString,
  name: isString,
  author: isNullable(isString),
  version: isNullable(isString),
  description: isNullable(isString),
  path: isString,
  preview: isNullable(isString),
  warnings: isArrayOf(isString),
  installed: isNullable(isSkinSummary),
})
