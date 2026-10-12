import { basename, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  analyzeRecording,
  type RecordingAnalysis,
} from '@e2e/support/audio/analyzeRecording'
import { playTone, type TonePlayer } from '@e2e/support/audio/playTone'
import { writeTone } from '@e2e/support/audio/writeTone'
import { createSandbox } from '@e2e/support/createSandbox'
import { launchApp } from '@e2e/support/launchApp'
import type { AppDriver, Sandbox } from '@e2e/support/types'
import { waitForRecording } from '@e2e/support/waitForRecording'
import { waitToShow } from '@e2e/support/waitToShow'

/** Longer than any test records, so the tones play throughout. */
const TONE_SECONDS = 60

/** One launch of the app with test tones playing, and its recording. */
type Session = {
  sandbox: Sandbox
  app: AppDriver
  tones: TonePlayer[]
  file: string
  analysis: RecordingAnalysis
}

/**
 * Starts the app, plays a tone per entry of `tones` (an app named after
 * the key, at the value's frequency), runs `act`, then waits for the one
 * recording and analyzes it at `analyzeHz`.
 */
const record = async (
  session: Partial<Session>,
  tones: Readonly<Record<string, number>>,
  analyzeHz: number,
  act: (app: AppDriver) => Promise<void>,
) => {
  const sandbox = await createSandbox()
  session.sandbox = sandbox
  session.tones = []
  const app = await launchApp(sandbox)
  session.app = app
  for (const [name, hz] of Object.entries(tones)) {
    const wav = join(sandbox.home, `${hz}.wav`)
    await writeTone(wav, hz, TONE_SECONDS)
    session.tones.push(playTone(wav, name))
  }
  await act(app)
  const file = await waitForRecording(sandbox)
  session.file = basename(file)
  session.analysis = await analyzeRecording(file, analyzeHz)
}

const close = async (session: Partial<Session>) => {
  await Promise.all(session.tones?.map(t => t.stop()) ?? [])
  await session.app?.quit()
  await session.sandbox?.remove()
}

describe('Recording all system audio', () => {
  describe('Given a tone playing through the speakers', () => {
    describe('When I record for 4 seconds and stop', () => {
      const session: Partial<Session> = {}

      beforeAll(() =>
        record(session, { 'E2E tone': 1000 }, 1000, async app => {
          await app.press({ name: 'Record' })
          await waitToShow(app, { name: '● REC' })
          await sleep(4000)
          await app.press({ name: 'Stop' })
        }),
      )
      afterAll(() => close(session))

      it('saves an MP3 named after the source', () => {
        expect(session.file).toMatch(
          /^System audio \d{4}-\d\d-\d\d \d\d-\d\d\.mp3$/,
        )
      })

      it('records the tone for as long as it recorded', () => {
        expect(session.analysis?.audibleMs).toBeGreaterThanOrEqual(3500)
        expect(session.analysis?.durationMs).toBeLessThan(5500)
      })

      it('records the tone without distortion', () => {
        expect(session.analysis?.toneRatio).toBeGreaterThan(0.95)
      })

      it('lists the recording in the library', async () => {
        const { app, file = '' } = session
        if (!app) {
          throw new Error('the app did not start')
        }
        await app.press({ name: 'Library' })
        await waitToShow(app, { name: `Select ${file.replace(/\.mp3$/, '')}` })
      })
    })
  })
})

describe('Pausing a recording', () => {
  describe('Given a tone playing through the speakers', () => {
    describe('When I record 2 seconds, pause for 3, then record 2 more', () => {
      const session: Partial<Session> = {}

      beforeAll(() =>
        record(session, { 'E2E tone': 1000 }, 1000, async app => {
          await app.press({ name: 'Record' })
          await waitToShow(app, { name: '● REC' })
          await sleep(2000)
          await app.press({ name: 'Pause' })
          await waitToShow(app, { name: '⏸ PAUSED' })
          await sleep(3000)
          await app.press({ name: 'Resume' })
          await waitToShow(app, { name: '● REC' })
          await sleep(2000)
          await app.press({ name: 'Stop' })
        }),
      )
      afterAll(() => close(session))

      it('leaves the paused time out of the recording', () => {
        expect(session.analysis?.durationMs).toBeGreaterThanOrEqual(3500)
        expect(session.analysis?.durationMs).toBeLessThan(5500)
      })

      it('records the tone on both sides of the pause', () => {
        expect(session.analysis?.audibleMs).toBeGreaterThanOrEqual(3500)
        expect(session.analysis?.toneRatio).toBeGreaterThan(0.95)
      })
    })
  })
})

describe('Recording one app', () => {
  describe('Given two apps playing different tones', () => {
    describe('When I choose one of them as the source and record', () => {
      const session: Partial<Session> = {}

      beforeAll(() =>
        record(
          session,
          { 'E2E tone 1000': 1000, 'E2E tone 440': 440 },
          1000,
          async app => {
            await app.press({ name: 'Source: All system audio' })
            await waitToShow(app, { name: 'E2E tone 1000$', match: 'regex' })
            await app.press({ name: 'E2E tone 1000$', match: 'regex' })
            await waitToShow(app, { name: 'Source: E2E tone 1000' })
            await app.press({ name: 'Record' })
            await waitToShow(app, { name: '● REC' })
            await sleep(3000)
            await app.press({ name: 'Stop' })
          },
        ),
      )
      afterAll(() => close(session))

      it('saves an MP3 named after the app', () => {
        expect(session.file).toMatch(/^E2E tone 1000 /)
      })

      it("records that app's tone and not the other's", () => {
        expect(session.analysis?.audibleMs).toBeGreaterThanOrEqual(2500)
        expect(session.analysis?.toneRatio).toBeGreaterThan(0.95)
      })
    })
  })
})
