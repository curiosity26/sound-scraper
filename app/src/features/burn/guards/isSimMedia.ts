import type { SimMedia } from '@/bridge/generated'
import { isUnionOf } from '@/shared/utils/guards/isUnionOf'

export const isSimMedia = isUnionOf<SimMedia>()(
  'blank74',
  'blank80',
  'rewritableUsed',
  'none',
  'dvd',
)
