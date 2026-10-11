import type { Proposal } from '@/native/bridge'
import { type Guard, isNullable, isNumber, isShape } from '@/utils/guards'

const isRange: Guard<[number, number]> = (
  value: unknown,
): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every(isNumber)

export const isProposal = isShape<Proposal>({
  atMs: isNumber,
  gapStartMs: isNumber,
  gapEndMs: isNumber,
  delete: isNullable(isRange),
})
