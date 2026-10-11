import type { SimMedia } from '@/native/bridge'

import { isUnionOf } from './isUnionOf'

export const isSimMedia = isUnionOf<SimMedia>()(
  'blank74',
  'blank80',
  'rewritableUsed',
  'none',
  'dvd',
)
