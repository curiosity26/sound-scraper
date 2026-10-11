import type { SimFault } from '@/bridge/generated'
import { isNumber, isOneOf, isShape } from '@/shared/utils/guards'
import { isVariantOf } from '@/shared/utils/guards/isVariantOf'

export const isSimFault = isVariantOf<SimFault, 'kind'>('kind', {
  none: isShape<{ kind: 'none' }>({ kind: isOneOf('none') }),
  underrun: isShape<{ kind: 'underrun'; track: number }>({
    kind: isOneOf('underrun'),
    track: isNumber,
  }),
  removed: isShape<{ kind: 'removed'; track: number }>({
    kind: isOneOf('removed'),
    track: isNumber,
  }),
  writeError: isShape<{ kind: 'writeError'; track: number }>({
    kind: isOneOf('writeError'),
    track: isNumber,
  }),
})
