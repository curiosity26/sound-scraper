import type { Edits } from './types'

export function removeSplice(e: Edits, id: number): Edits {
  return { ...e, splices: e.splices.filter(s => s.id !== id) }
}
