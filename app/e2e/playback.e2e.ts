import { basename, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  analyzeRecording,
  type RecordingAnalysis,
} from '@e2e/support/audio/analyzeRecording'
import { recordOutput } from '@e2e/support/audio/recordOutput'
import { openSession, type Session } from '@e2e/support/openSession'
import { recordTake } from '@e2e/support/recordTake'
import { waitForRecordings } from '@e2e/support/waitForRecordings'
import { waitToShow } from '@e2e/support/waitToShow'

describe('Playing a recording back', () => {
  describe('Given a recording of a tone, and nothing else playing', () => {
    describe('When I select it in the library and press Play', () => {
      let session: Session
      let heard: RecordingAnalysis
      let playLabel: string

      beforeAll(async () => {
        session = await openSession()
        const { app } = session
        const tone = await session.play('E2E tone', 1000)
        await recordTake(app, 3000)
        await tone.stop()
        const [path = ''] = await waitForRecordings(session.sandbox, 1)
        const name = basename(path, '.mp3')
        await app.press({ name: 'Library' })
        await app.press({ name: `Select ${name}` })
        await waitToShow(app, { name: `♪ ${name}` })

        const wav = join(session.sandbox.home, 'heard.wav')
        const listener = recordOutput(wav)
        await app.press({ name: 'Play' })
        // The Play button turns into Pause while it plays.
        playLabel = (
          await waitToShow(app, { name: 'Pause', role: 'push button' })
        ).name
        await sleep(2000)
        await listener.stop()
        heard = await analyzeRecording(wav, 1000)
      })
      afterAll(() => session.close())

      it('plays the tone through the speakers', () => {
        expect(heard.audibleMs).toBeGreaterThanOrEqual(1000)
        expect(heard.toneRatio).toBeGreaterThan(0.9)
      })

      it('shows Pause while it plays', () => {
        expect(playLabel).toBe('Pause')
      })
    })
  })
})
