import { editsToList } from './editsToList'
import type { Edits } from './types'

export const editsToJson = (e: Edits): string => {
  return JSON.stringify(editsToList(e))
}
