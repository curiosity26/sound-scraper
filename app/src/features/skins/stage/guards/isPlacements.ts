import { isArrayOf } from '@/shared/utils/guards'

import { isPlacement } from './isPlacement'

export const isPlacements = isArrayOf(isPlacement)
