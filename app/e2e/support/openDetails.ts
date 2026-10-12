import type { AppDriver } from './types'
import { waitToShow } from './waitToShow'

/**
 * Shows the library, selects the recording called `name` (its file name
 * without .mp3) and opens its details.
 */
export const openDetails = async (
  app: AppDriver,
  name: string,
): Promise<void> => {
  if (!(await app.find({ name: 'Library panel' }))) {
    await app.press({ name: 'Library' })
  }
  await waitToShow(app, { name: `Select ${name}` })
  await app.press({ name: `Select ${name}` })
  await app.press({ name: 'Edit 1 selected' })
  await waitToShow(app, { name: 'Details panel' })
}
