import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SkinInspection } from '@/bridge/generated'
import { fakeSkins } from '@test/fakes/NativeSkins'
import { fakeCore } from '@test/fakes/NativeSoundScraper'
import { testSkin } from '@test/fixtures/testSkin'

vi.mock(
  '@/bridge/NativeSoundScraper',
  () => import('@test/fakes/NativeSoundScraper'),
)
vi.mock('@/bridge/NativeSkins', () => import('@test/fakes/NativeSkins'))

// The app keeps state in its modules (the skin, the settings tab, the skin
// waiting to be installed), so each test loads them afresh. The faked
// native modules load first, once, so the app and the test share the fakes
// imported above.
const loadApp = async () => {
  await Promise.all([
    import('@/bridge/NativeSoundScraper'),
    import('@/bridge/NativeSkins'),
  ])
  vi.resetModules()
  const [main, settings, store] = await Promise.all([
    import('./MainWindow'),
    import('@/roots/SettingsWindow'),
    import('@/features/skins/skinStore'),
  ])
  fakeCore.reset()
  fakeSkins.reset()
  return {
    MainWindow: main.MainWindow,
    SettingsWindow: settings.SettingsWindow,
    skinStore: store.skinStore,
  }
}

type App = Awaited<ReturnType<typeof loadApp>>

/** The main and settings windows, which share the app's JS runtime. */
const showWindows = async (app: App) => {
  const { MainWindow, SettingsWindow } = app
  app.skinStore.set(testSkin())
  await render(
    <>
      <MainWindow />
      <SettingsWindow />
    </>,
  )
}

/** Skins opened from the file manager while the app runs. */
const openFiles = (paths: string[]) =>
  act(() => {
    fakeSkins.openFiles(paths)
  })

const retro: SkinInspection = {
  id: 'com.example.retro',
  name: 'Retro',
  author: null,
  version: '1.0',
  description: null,
  path: '/x/Retro.sskin',
  preview: null,
  warnings: [],
  installed: null,
}

describe('the main window', () => {
  let app: App

  beforeEach(async () => {
    app = await loadApp()
  })

  describe('given nothing was opened at launch', () => {
    it('leaves the settings closed', async () => {
      await showWindows(app)
      expect(fakeSkins.isVisible('settings')).toBe(false)
    })
  })

  describe('given a skin archive was opened at launch', () => {
    it('asks whether to install it', async () => {
      fakeSkins.setInspection('/x/Retro.sskin', retro)
      fakeSkins.openFiles(['/x/Retro.sskin'], { atLaunch: true })
      await showWindows(app)
      expect(await screen.findByText('Install this skin?')).toBeOnTheScreen()
    })
  })

  describe('when a skin archive is opened from the file manager', () => {
    beforeEach(async () => {
      fakeSkins.setInspection('/x/Retro.sskin', retro)
      await showWindows(app)
      await openFiles(['/x/Retro.sskin'])
    })

    it('opens the settings', () => {
      expect(fakeSkins.isVisible('settings')).toBe(true)
    })

    it('turns the settings to the Skin tab', () => {
      expect(screen.getByRole('tab', { name: 'Skin' })).toBeSelected()
    })

    it('asks whether to install it', async () => {
      expect(await screen.findByText('Install this skin?')).toBeOnTheScreen()
    })

    it('says which skin it is', async () => {
      expect(await screen.findByText('Retro 1.0')).toBeOnTheScreen()
    })
  })

  describe('when a .zip archive, named in capitals, is opened', () => {
    it('asks whether to install it', async () => {
      fakeSkins.setInspection('C:\\x\\SKIN.ZIP', retro)
      await showWindows(app)
      await openFiles(['C:\\x\\SKIN.ZIP'])
      expect(await screen.findByText('Install this skin?')).toBeOnTheScreen()
    })
  })

  describe("when an archive that isn't a skin is opened", () => {
    beforeEach(async () => {
      fakeSkins.setInspection(
        '/x/Broken.sskin',
        new Error('skin.json is missing'),
      )
      await showWindows(app)
      await openFiles(['/x/Broken.sskin'])
    })

    it("says it couldn't open it", async () => {
      expect(
        await screen.findByText("Couldn't open Broken.sskin"),
      ).toBeOnTheScreen()
    })

    it('says why', async () => {
      expect(await screen.findByText('skin.json is missing')).toBeOnTheScreen()
    })
  })

  describe('when a skin folder is opened', () => {
    beforeEach(async () => {
      fakeSkins.setCurrentSkin({ ...testSkin(), name: 'Mine' })
      await showWindows(app)
      await openFiles(['/x/My Skin'])
    })

    it('uses it straight away, live from its folder', async () => {
      expect(await screen.findByText('Live from My Skin')).toBeOnTheScreen()
    })

    it("doesn't ask to install it", async () => {
      await screen.findByText('Live from My Skin')
      expect(screen.queryByText('Install this skin?')).not.toBeOnTheScreen()
    })
  })
})
