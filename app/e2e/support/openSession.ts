import { join } from 'node:path'

import { playTone, type TonePlayer } from './audio/playTone'
import { writeTone } from './audio/writeTone'
import { createSandbox } from './createSandbox'
import { launchApp } from './launchApp'
import type { AppDriver, Sandbox } from './types'

/** How long tone files last: longer than any test plays one. */
const TONE_SECONDS = 60

/** One launch of the app, with test tones to play beside it. */
export type Session = {
  readonly sandbox: Sandbox
  readonly app: AppDriver
  /**
   * Plays a `hz` tone as an app called `name` (how the sound server, and
   * so the app's source menu, lists it).
   */
  readonly play: (name: string, hz: number) => Promise<TonePlayer>
  /** Stops the tones and the app and removes the sandbox. */
  readonly close: () => Promise<void>
}

/** Launches the app in a fresh sandbox. */
export const openSession = async (): Promise<Session> => {
  const sandbox = await createSandbox()
  const tones: TonePlayer[] = []
  let app: AppDriver
  try {
    app = await launchApp(sandbox)
  } catch (e) {
    await sandbox.remove()
    throw e
  }
  return {
    sandbox,
    app,
    play: async (name, hz) => {
      const wav = join(sandbox.home, `tone-${hz}.wav`)
      await writeTone(wav, hz, TONE_SECONDS)
      const tone = playTone(wav, name)
      tones.push(tone)
      return tone
    },
    close: async () => {
      await Promise.all(tones.map(t => t.stop()))
      await app.quit()
      await sandbox.remove()
    },
  }
}
