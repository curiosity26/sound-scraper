import type { ResolvedSkin } from '@/bridge/generated'
import {
  isArrayOf,
  isBoolean,
  isNullable,
  isRecordOf,
  isShape,
  isString,
} from '@/shared/utils/guards'

import { isResolvedFont } from './isResolvedFont'
import { isResolvedPanels } from './isResolvedPanels'
import { isResolvedVisualizer } from './isResolvedVisualizer'

export const isResolvedSkin = isShape<ResolvedSkin>({
  id: isString,
  name: isString,
  author: isNullable(isString),
  version: isNullable(isString),
  description: isNullable(isString),
  dir: isString,
  builtin: isBoolean,
  revision: isString,
  colors: isRecordOf(isString),
  fonts: isRecordOf(isResolvedFont),
  panels: isResolvedPanels,
  visualizer: isResolvedVisualizer,
  warnings: isArrayOf(isString),
})
