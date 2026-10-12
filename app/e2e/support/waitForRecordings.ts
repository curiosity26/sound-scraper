import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect } from 'vitest'

import { eventually } from './eventually'
import type { Sandbox } from './types'

/**
 * The paths of the MP3s in the recordings folder, sorted by name, once
 * there are `count` of them (a recording is a .part file until the app
 * finalizes it).
 */
export const waitForRecordings = (
  sandbox: Sandbox,
  count: number,
): Promise<readonly string[]> =>
  eventually(async () => {
    const files = await readdir(sandbox.recordingsDir).catch(() => [])
    const mp3s = files.filter(f => f.endsWith('.mp3')).toSorted()
    expect(mp3s).toHaveLength(count)
    return mp3s.map(f => join(sandbox.recordingsDir, f))
  })
