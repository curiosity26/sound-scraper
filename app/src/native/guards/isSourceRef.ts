import type { SourceRef } from '@/native/bridge'
import { isNullable, isOneOf, isShape, isString } from '@/utils/guards'

import { isVariantOf } from './isVariantOf'

export const isSourceRef = isVariantOf<SourceRef, 'kind'>('kind', {
  system: isShape<{ kind: 'system' }>({ kind: isOneOf('system') }),
  app: isShape<Extract<SourceRef, { kind: 'app' }>>({
    kind: isOneOf('app'),
    id: isNullable(isString),
    name: isString,
  }),
})
