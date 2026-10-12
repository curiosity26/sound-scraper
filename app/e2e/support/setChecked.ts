import { expect } from 'vitest'

import { eventually } from './eventually'
import type { AppDriver, Query } from './types'
import { waitToShow } from './waitToShow'

/**
 * Presses a check box or radio button unless it's already `checked`, and
 * waits until it shows that state.
 */
export const setChecked = async (
  app: AppDriver,
  query: Query,
  checked: boolean,
): Promise<void> => {
  const element = await waitToShow(app, query)
  if (element.checked !== checked) {
    await app.press(query)
  }
  await eventually(async () => {
    expect(await app.find(query)).toMatchObject({ checked })
  })
}
