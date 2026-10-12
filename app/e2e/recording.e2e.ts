import { basename } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  analyzeRecording,
  type RecordingAnalysis,
} from '@e2e/support/audio/analyzeRecording'
import { readTags, type Tags } from '@e2e/support/audio/readTags'
import { openSession, type Session } from '@e2e/support/openSession'
import { recordTake } from '@e2e/support/recordTake'
import { waitForRecordings } from '@e2e/support/waitForRecordings'
import { waitToShow } from '@e2e/support/waitToShow'

describe('Recording all system audio', () => {
  describe('Given a tone playing through the speakers', () => {
    describe('When I record for 4 seconds and stop', () => {
      let session: Session
      let file: string
      let analysis: RecordingAnalysis
      let tags: Tags

      beforeAll(async () => {
        session = await openSession()
        await session.play('E2E tone', 1000)
        await recordTake(session.app, 4000)
        const [path = ''] = await waitForRecordings(session.sandbox, 1)
        file = basename(path)
        analysis = await analyzeRecording(path, 1000)
        tags = await readTags(path)
      })
      afterAll(() => session.close())

      it('saves an MP3 named after the source', () => {
        expect(file).toMatch(/^System audio \d{4}-\d\d-\d\d \d\d-\d\d\.mp3$/)
      })

      it('records the tone for as long as it recorded', () => {
        expect(analysis.audibleMs).toBeGreaterThanOrEqual(3500)
        expect(analysis.durationMs).toBeLessThan(5500)
      })

      it('records the tone without distortion', () => {
        expect(analysis.toneRatio).toBeGreaterThan(0.95)
      })

      it('encodes it at the default 192 kbps', () => {
        expect(analysis.bitrateKbps).toBeGreaterThanOrEqual(185)
        expect(analysis.bitrateKbps).toBeLessThanOrEqual(200)
      })

      it('tags it with ID3v2.4, titled after the file', () => {
        expect(tags.version).toBe('2.4')
        expect(tags.title).toBe(file.replace(/\.mp3$/, ''))
      })

      it('lists the recording in the library', async () => {
        await session.app.press({ name: 'Library' })
        await waitToShow(session.app, {
          name: `Select ${file.replace(/\.mp3$/, '')}`,
        })
      })
    })
  })
})

describe('Pausing a recording', () => {
  describe('Given a tone playing through the speakers', () => {
    describe('When I record 2 seconds, pause for 3, then record 2 more', () => {
      let session: Session
      let analysis: RecordingAnalysis

      beforeAll(async () => {
        session = await openSession()
        const { app } = session
        await session.play('E2E tone', 1000)
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
        const [path = ''] = await waitForRecordings(session.sandbox, 1)
        analysis = await analyzeRecording(path, 1000)
      })
      afterAll(() => session.close())

      it('leaves the paused time out of the recording', () => {
        expect(analysis.durationMs).toBeGreaterThanOrEqual(3500)
        expect(analysis.durationMs).toBeLessThan(5500)
      })

      it('records the tone on both sides of the pause', () => {
        expect(analysis.audibleMs).toBeGreaterThanOrEqual(3500)
        expect(analysis.toneRatio).toBeGreaterThan(0.95)
      })
    })
  })
})

describe('Recording one app', () => {
  describe('Given two apps playing different tones', () => {
    describe('When I choose one of them as the source and record', () => {
      let session: Session
      let file: string
      let analysis: RecordingAnalysis

      beforeAll(async () => {
        session = await openSession()
        const { app } = session
        await session.play('E2E tone 1000', 1000)
        await session.play('E2E tone 440', 440)
        await app.press({ name: 'Source: All system audio' })
        const item = { name: 'E2E tone 1000$', match: 'regex' } as const
        await waitToShow(app, item)
        await app.press(item)
        await waitToShow(app, { name: 'Source: E2E tone 1000' })
        await recordTake(app, 3000)
        const [path = ''] = await waitForRecordings(session.sandbox, 1)
        file = basename(path)
        analysis = await analyzeRecording(path, 1000)
      })
      afterAll(() => session.close())

      it('saves an MP3 named after the app', () => {
        expect(file).toMatch(/^E2E tone 1000 /)
      })

      it("records that app's tone and not the other's", () => {
        expect(analysis.audibleMs).toBeGreaterThanOrEqual(2500)
        expect(analysis.toneRatio).toBeGreaterThan(0.95)
      })
    })
  })
})

describe('Trimming silence', () => {
  /**
   * Records 2 seconds of silence, a 2 second tone, then 2 seconds of
   * silence, and returns the recording's analysis.
   */
  const recordToneBetweenSilences = async (session: Session) => {
    const { app } = session
    await app.press({ name: 'Record' })
    await waitToShow(app, { name: '● REC' })
    await sleep(2000)
    const tone = await session.play('E2E tone', 1000)
    await sleep(2000)
    await tone.stop()
    await sleep(2000)
    await app.press({ name: 'Stop' })
    const [path = ''] = await waitForRecordings(session.sandbox, 1)
    return analyzeRecording(path, 1000)
  }

  describe('Given trimming is on, as it is by default', () => {
    describe('When I record a tone between two silences', () => {
      let session: Session
      let analysis: RecordingAnalysis

      beforeAll(async () => {
        session = await openSession()
        analysis = await recordToneBetweenSilences(session)
      })
      afterAll(() => session.close())

      it('cuts the silence before and after the tone', () => {
        expect(analysis.durationMs).toBeGreaterThanOrEqual(1500)
        expect(analysis.durationMs).toBeLessThan(3000)
        expect(analysis.audibleMs).toBeGreaterThanOrEqual(1500)
      })
    })
  })

  describe('Given I turned trimming off in Settings', () => {
    describe('When I record a tone between two silences', () => {
      let session: Session
      let analysis: RecordingAnalysis

      beforeAll(async () => {
        session = await openSession()
        const { app } = session
        await app.press({ name: 'Settings' })
        await app.press({ name: '☑ Trim silence', match: 'prefix' })
        await waitToShow(app, { name: '☐ Trim silence', match: 'prefix' })
        analysis = await recordToneBetweenSilences(session)
      })
      afterAll(() => session.close())

      it('keeps the silence', () => {
        expect(analysis.durationMs).toBeGreaterThanOrEqual(5500)
        expect(analysis.audibleMs).toBeLessThan(3000)
      })
    })
  })
})

describe('Recording settings', () => {
  describe('Given I chose 320 kbps and ID3v2.3 in Settings', () => {
    describe('When I record a tone', () => {
      let session: Session
      let analysis: RecordingAnalysis
      let tags: Tags

      beforeAll(async () => {
        session = await openSession()
        const { app } = session
        await app.press({ name: 'Settings' })
        await app.press({ name: '○ 320 kbps', match: 'prefix' })
        await waitToShow(app, { name: '● 320 kbps', match: 'prefix' })
        await app.press({ name: '○ ID3v2.3', match: 'prefix' })
        await waitToShow(app, { name: '● ID3v2.3', match: 'prefix' })
        await session.play('E2E tone', 1000)
        await recordTake(app, 3000)
        const [path = ''] = await waitForRecordings(session.sandbox, 1)
        analysis = await analyzeRecording(path, 1000)
        tags = await readTags(path)
      })
      afterAll(() => session.close())

      it('encodes it at 320 kbps', () => {
        expect(analysis.bitrateKbps).toBeGreaterThanOrEqual(310)
        expect(analysis.bitrateKbps).toBeLessThanOrEqual(330)
      })

      it('tags it with ID3v2.3', () => {
        expect(tags.version).toBe('2.3')
      })
    })
  })
})
