import { eventually } from './eventually'
import type { AppDriver } from './types'
import { waitToShow } from './waitToShow'

/** Creates a playlist called `name` from the library; it then shows it. */
export const createPlaylist = async (
  app: AppDriver,
  name: string,
): Promise<void> => {
  if (!(await app.find({ name: 'Library panel' }))) {
    await app.press({ name: 'Library' })
  }
  await app.press({ name: 'Choose the library or a playlist' })
  await app.press({ name: 'New Playlist…' })
  await eventually(() => app.type(name))
  await app.press({ name: 'OK' })
  await waitToShow(app, {
    name: `LIBRARY: ${name.toUpperCase()} (0)`,
  })
}
