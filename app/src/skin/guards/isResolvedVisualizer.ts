import type { ResolvedVisualizer } from '@/native/bridge'
import { isArrayOf, isRecordOf, isShape } from '@/utils/guards'

import { isJsonValue } from './isJsonValue'

export const isResolvedVisualizer = isShape<ResolvedVisualizer>({
  presets: isArrayOf(isRecordOf(isJsonValue)),
})
