import { burnApi } from './burnApi'
import { burnJob } from './burnJob'
import { burnTarget } from './burnTarget'
import { isRunning } from './isRunning'
import type { Target } from './types'

/**
 * Burn CD… / Save CD Image… in the library: shows the burn panel for
 * `target`, unless a burn is still running (it keeps showing that).
 */
export const openBurnPanel = (target: Target, show: () => void): void => {
  const current = burnJob.get()
  if (current) {
    let running = false
    try {
      running = isRunning(burnApi.status(current.id))
    } catch {}
    if (!running) {
      try {
        burnApi.close(current.id)
      } catch {}
      burnJob.set(null)
    }
  }
  burnTarget.set(target)
  show()
}
