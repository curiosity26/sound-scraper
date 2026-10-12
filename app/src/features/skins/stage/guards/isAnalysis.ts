import type { Analysis } from '@/features/skins/stage/types'
import { isShape } from '@/shared/utils/guards'

import { isPlacements } from './isPlacements'

export const isAnalysis = isShape<Analysis>({
  constrain: isPlacements,
  tidy: isPlacements,
})
