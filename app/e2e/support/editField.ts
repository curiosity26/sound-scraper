import { eventually } from './eventually'
import type { AppDriver } from './types'
import { waitToShow } from './waitToShow'

/**
 * Sets a field of the details pane (File name, Artist…) to `text` and
 * commits it with Return, as a user would.
 */
export const editField = async (
  app: AppDriver,
  label: string,
  text: string,
): Promise<void> => {
  await app.press({ name: `${label}: `, match: 'prefix' })
  // The field takes focus once it has replaced the value.
  await eventually(() => app.type(text))
  await app.key('Return')
  await waitToShow(app, { name: `${label}: ${text}. Click to edit.` })
}
