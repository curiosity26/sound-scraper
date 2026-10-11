import type { SourceRef } from '@/bridge/generated'
import { isNullable, isOneOf, isShape, isString } from '@/shared/utils/guards'
import { isVariantOf } from '@/shared/utils/guards/isVariantOf'

export const isSourceRef = isVariantOf<SourceRef, 'kind'>('kind', {
  system: isShape<{ kind: 'system' }>({ kind: isOneOf('system') }),
  app: isShape<Extract<SourceRef, { kind: 'app' }>>({
    kind: isOneOf('app'),
    id: isNullable(isString),
    name: isString,
  }),
})
