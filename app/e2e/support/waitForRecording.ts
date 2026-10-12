import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect } from 'vitest'

import { eventually } from './eventually'
import type { Sandbox } from './types'

/**
 * The path of the one MP3 in the recordings folder, once the app has
 * finalized it (a recording is a .part file until then).
 */
export const waitForRecording = (sandbox: Sandbox): Promise<string> =>
  eventually(async () => {
    const files = await readdir(sandbox.recordingsDir).catch(() => [])
    const mp3s = files.filter(f => f.endsWith('.mp3'))
    expect(mp3s).toHaveLength(1)
    return join(sandbox.recordingsDir, mp3s[0] ?? '')
  })
