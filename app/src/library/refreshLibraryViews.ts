import { refreshers } from './refreshers'

/** Rescans the recordings folder in every library view. */
export function refreshLibraryViews() {
  refreshers.forEach(refresh => refresh())
}
