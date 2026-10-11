import type { ResolvedVisualizer } from '@/bridge/generated'
import { isArrayOf, isRecordOf, isShape } from '@/shared/utils/guards'

import { isJsonValue } from './isJsonValue'

export const isResolvedVisualizer = isShape<ResolvedVisualizer>({
  presets: isArrayOf(isRecordOf(isJsonValue)),
})
