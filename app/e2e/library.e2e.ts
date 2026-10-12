import { access } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { readTags, type Tags } from '@e2e/support/audio/readTags'
import { editField } from '@e2e/support/editField'
import { eventually } from '@e2e/support/eventually'
import { openDetails } from '@e2e/support/openDetails'
import { openSession, type Session } from '@e2e/support/openSession'
import { recordTake } from '@e2e/support/recordTake'
import { waitForRecordings } from '@e2e/support/waitForRecordings'
import { waitToShow } from '@e2e/support/waitToShow'

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  )

/** Opens a session and records one short take; returns its name. */
const withOneRecording = async (session: Session) => {
  await session.play('E2E tone', 1000)
  await recordTake(session.app, 2000)
  const [path = ''] = await waitForRecordings(session.sandbox, 1)
  return basename(path, '.mp3')
}

describe('Renaming a recording', () => {
  describe('Given a recording in the library', () => {
    describe('When I change its file name in its details', () => {
      let session: Session
      let files: readonly string[]

      beforeAll(async () => {
        session = await openSession()
        const name = await withOneRecording(session)
        await openDetails(session.app, name)
        await editField(session.app, 'File name', 'Renamed take')
        files = await eventually(async () => {
          const found = await waitForRecordings(session.sandbox, 1)
          expect(found.map(f => basename(f))).toEqual(['Renamed take.mp3'])
          return found
        })
      })
      afterAll(() => session.close())

      it('renames the file on disk', () => {
        expect(files.map(f => basename(f))).toEqual(['Renamed take.mp3'])
      })

      it('lists it under the new name', async () => {
        await waitToShow(session.app, { name: 'Select Renamed take' })
      })
    })
  })
})

describe('Editing tags', () => {
  describe('Given a recording in the library', () => {
    describe('When I set its title, artist and album in its details', () => {
      let session: Session
      let tags: Tags

      beforeAll(async () => {
        session = await openSession()
        const name = await withOneRecording(session)
        const { app } = session
        await openDetails(app, name)
        await editField(app, 'Title', 'Sine Language')
        await editField(app, 'Artist', 'The Test Tones')
        await editField(app, 'Album', 'Thousand Hertz')
        const [path = ''] = await waitForRecordings(session.sandbox, 1)
        tags = await eventually(async () => {
          const read = await readTags(path)
          expect(read.album).toBe('Thousand Hertz')
          return read
        })
      })
      afterAll(() => session.close())

      it('writes them to the MP3', () => {
        expect(tags).toMatchObject({
          title: 'Sine Language',
          artist: 'The Test Tones',
          album: 'Thousand Hertz',
        })
      })
    })
  })
})

describe('Moving a recording to the Trash', () => {
  describe('Given a recording in the library', () => {
    describe('When I move it to the Trash from its details and confirm', () => {
      let session: Session
      let name: string

      beforeAll(async () => {
        session = await openSession()
        name = await withOneRecording(session)
        const { app } = session
        await openDetails(app, name)
        await app.press({ name: 'Details actions' })
        await waitToShow(app, { name: 'Move to Trash…' })
        await app.press({ name: 'Move to Trash…' })
        await waitToShow(app, { name: 'Move to Trash', role: 'push button' })
        await app.press({ name: 'Move to Trash', role: 'push button' })
        await waitForRecordings(session.sandbox, 0)
      })
      afterAll(() => session.close())

      it('takes it out of the recordings folder', async () => {
        expect(
          await exists(join(session.sandbox.recordingsDir, `${name}.mp3`)),
        ).toBe(false)
      })

      it('puts it in the Trash', async () => {
        const trashed = join(
          session.sandbox.home,
          '.local/share/Trash/files',
          `${name}.mp3`,
        )
        expect(await exists(trashed)).toBe(true)
      })

      it('takes it out of the library', async () => {
        await eventually(() =>
          expect(
            session.app.find({ name: `Select ${name}` }),
          ).resolves.toBeUndefined(),
        )
      })
    })
  })
})
