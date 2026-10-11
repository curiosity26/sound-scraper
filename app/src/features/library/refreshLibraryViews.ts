import { refreshers } from './refreshers'

/** Rescans the recordings folder in every library view. */
export const refreshLibraryViews = () => {
  refreshers.forEach(refresh => {
    refresh()
  })
}
