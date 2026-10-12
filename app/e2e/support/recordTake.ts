import { setTimeout as sleep } from 'node:timers/promises'

import type { AppDriver } from './types'
import { waitToShow } from './waitToShow'

/** Presses Record, records for `ms` once recording has started, and stops. */
export const recordTake = async (app: AppDriver, ms: number): Promise<void> => {
  await app.press({ name: 'Record' })
  await waitToShow(app, { name: '● REC' })
  await sleep(ms)
  await app.press({ name: 'Stop' })
}
