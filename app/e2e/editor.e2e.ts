import { basename } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  analyzeRecording,
  type RecordingAnalysis,
} from '@e2e/support/audio/analyzeRecording'
import { openDetails } from '@e2e/support/openDetails'
import { openSession, type Session } from '@e2e/support/openSession'
import { recordTake } from '@e2e/support/recordTake'
import { waitForRecordings } from '@e2e/support/waitForRecordings'
import { waitToShow } from '@e2e/support/waitToShow'

describe('Splitting a recording into tracks', () => {
  describe('Given a recording of two tones with silence between them', () => {
    describe('When I auto slice it in the track editor and save it as tracks', () => {
      let session: Session
      let parts: readonly RecordingAnalysis[]

      beforeAll(async () => {
        session = await openSession()
        const { app } = session
        await app.press({ name: 'Record' })
        await waitToShow(app, { name: '● REC' })
        const first = await session.play('E2E tone', 1000)
        await sleep(2500)
        await first.stop()
        await sleep(3000)
        const second = await session.play('E2E tone', 1000)
        await sleep(2500)
        await second.stop()
        await app.press({ name: 'Stop' })
        const [path = ''] = await waitForRecordings(session.sandbox, 1)

        await openDetails(app, basename(path, '.mp3'))
        await app.press({ name: 'Details actions' })
        await app.press({ name: 'Edit Track…' })
        await app.press({ name: 'Auto Slice' })
        // Any track length: the test's tones are shorter than the default.
        await app.press({ name: 'Tracks over down' })
        await app.press({ name: 'Tracks over down' })
        await app.press({ name: 'Add Slices' })
        await waitToShow(app, { name: 'Track 2: ', match: 'prefix' })
        await app.press({ name: 'Save…' })
        // Don't keep the unsplit recording.
        await app.press({ name: 'No, delete it' })

        const files = await waitForRecordings(session.sandbox, 2)
        parts = await Promise.all(files.map(f => analyzeRecording(f, 1000)))
      })
      afterAll(() => session.close())

      it('saves a file per track in place of the recording', () => {
        expect(parts).toHaveLength(2)
      })

      it('puts one tone in each track', () => {
        for (const part of parts) {
          expect(part.audibleMs).toBeGreaterThanOrEqual(2000)
          expect(part.audibleMs).toBeLessThan(3500)
          expect(part.toneRatio).toBeGreaterThan(0.95)
        }
      })
    })
  })
})

describe('Switching recordings in the track editor', () => {
  describe('Given two recordings, the first open in the track editor', () => {
    describe('When I click the second in the library', () => {
      let session: Session
      let second: string

      beforeAll(async () => {
        session = await openSession()
        const { app } = session
        await session.play('E2E tone', 1000)
        await recordTake(app, 1500)
        await waitForRecordings(session.sandbox, 1)
        await recordTake(app, 1500)
        const [first = '', other = ''] = (
          await waitForRecordings(session.sandbox, 2)
        ).map(path => basename(path, '.mp3'))
        second = other
        await openDetails(app, first)
        await app.press({ name: 'Details actions' })
        await app.press({ name: 'Edit Track…' })
        await waitToShow(app, { name: `Close Editor: ${first}` })
        await app.press({ name: second })
      })
      afterAll(() => session.close())

      it('opens it in the track editor', async () => {
        await waitToShow(session.app, { name: `Close Editor: ${second}` })
      })
    })
  })
})
