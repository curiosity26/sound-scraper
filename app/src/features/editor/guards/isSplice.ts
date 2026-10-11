import type { Splice } from '@/bridge/generated'
import { isNumber, isShape, isString } from '@/shared/utils/guards'

export const isSplice = isShape<Splice>({ atMs: isNumber, name: isString })
