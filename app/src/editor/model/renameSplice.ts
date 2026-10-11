import type { Edits } from './types'

export function renameSplice(e: Edits, id: number, name: string): Edits {
  return {
    ...e,
    splices: e.splices.map(s => (s.id === id ? { ...s, name } : s)),
  }
}
