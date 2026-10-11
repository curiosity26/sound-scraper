import { selection } from '@/library/selection'

/** Shows these recordings in the details panel (or window, with
 * `openDetails`). */
export const showDetails = (
  fileNames: string[],
  openDetails: (() => void) | undefined,
): void => {
  selection.set(fileNames)
  openDetails?.()
}
