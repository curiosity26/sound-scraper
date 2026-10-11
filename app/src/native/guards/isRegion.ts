import type { Region } from '@/native/bridge'
import { isNumber, isShape } from '@/utils/guards'

export const isRegion = isShape<Region>({ startMs: isNumber, endMs: isNumber })
