import type { Region } from '@/bridge/generated'
import { isNumber, isShape } from '@/shared/utils/guards'

export const isRegion = isShape<Region>({ startMs: isNumber, endMs: isNumber })
