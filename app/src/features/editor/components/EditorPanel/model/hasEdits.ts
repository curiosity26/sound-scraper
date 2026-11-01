import { isEmptyTags } from './isEmptyTags'
import type { Edits } from './types'

export const hasEdits = (e: Edits): boolean => {
  return (
    e.splices.length > 0 || e.deleted.length > 0 || !isEmptyTags(e.firstTags)
  )
}
