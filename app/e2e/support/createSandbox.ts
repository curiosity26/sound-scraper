import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Sandbox } from './types'

/**
 * A fresh home folder for one launch of the app, so it starts with default
 * settings and an empty library, and its recordings land where the test
 * looks (~/Music/Sound Scraper).
 */
export const createSandbox = async (): Promise<Sandbox> => {
  const home = await mkdtemp(join(tmpdir(), 'sound-scraper-e2e-'))
  return {
    home,
    recordingsDir: join(home, 'Music', 'Sound Scraper'),
    remove: () => rm(home, { recursive: true, force: true }),
  }
}
