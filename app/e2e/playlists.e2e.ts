import { basename } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, beforeAll, describe, it } from 'vitest'

import { createPlaylist } from '@e2e/support/createPlaylist'
import { openSession, type Session } from '@e2e/support/openSession'
import { recordTake } from '@e2e/support/recordTake'
import { waitForRecordings } from '@e2e/support/waitForRecordings'
import { waitToShow } from '@e2e/support/waitToShow'

describe('Recording into a playlist', () => {
  describe('Given a new playlist showing in the library', () => {
    describe('When I record', () => {
      let session: Session
      let name: string

      beforeAll(async () => {
        session = await openSession()
        const { app } = session
        await createPlaylist(app, 'Road Trip')
        await session.play('E2E tone', 1000)
        await app.press({ name: 'Record' })
        // The source display says where the recording is going.
        await waitToShow(app, { name: 'All system audio → Road Trip' })
        await sleep(2000)
        await app.press({ name: 'Stop' })
        const [path = ''] = await waitForRecordings(session.sandbox, 1)
        name = basename(path, '.mp3')
      })
      afterAll(() => session.close())

      it('adds the recording to the playlist', async () => {
        await waitToShow(session.app, { name: 'LIBRARY: ROAD TRIP (1)' })
        await waitToShow(session.app, { name: `Select ${name}` })
      })
    })
  })
})

describe('Adding a recording to a playlist', () => {
  describe('Given a recording and a playlist', () => {
    describe('When I select the recording in the library and add it to the playlist', () => {
      let session: Session
      let name: string

      beforeAll(async () => {
        session = await openSession()
        const { app } = session
        await session.play('E2E tone', 1000)
        await recordTake(app, 2000)
        const [path = ''] = await waitForRecordings(session.sandbox, 1)
        name = basename(path, '.mp3')
        await createPlaylist(app, 'Road Trip')
        await app.press({ name: 'Choose the library or a playlist' })
        await app.press({ name: 'Library', role: 'menu item' })
        await app.press({ name: `Select ${name}` })
        await app.press({ name: 'Add to ▾' })
        await app.press({ name: 'Road Trip', role: 'menu item' })
        await app.press({ name: 'Choose the library or a playlist' })
        await app.press({ name: 'Road Trip', role: 'menu item' })
      })
      afterAll(() => session.close())

      it('lists it in the playlist', async () => {
        await waitToShow(session.app, { name: 'LIBRARY: ROAD TRIP (1)' })
        await waitToShow(session.app, { name: `Select ${name}` })
      })
    })
  })
})
