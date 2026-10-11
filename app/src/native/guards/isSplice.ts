import type { Splice } from '@/native/bridge'
import { isNumber, isShape, isString } from '@/utils/guards'

export const isSplice = isShape<Splice>({ atMs: isNumber, name: isString })
