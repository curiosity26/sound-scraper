import { render, screen, userEvent } from '@testing-library/react-native'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SkinSummary } from '@/bridge/generated'
import { SkinProvider } from '@/features/skins/components/Skinned/SkinProvider'
import { skinStore } from '@/features/skins/skinStore'
import { fakeSkins } from '@test/fakes/NativeSkins'
import { fakeCore } from '@test/fakes/NativeSoundScraper'
import { testSkin } from '@test/fixtures/testSkin'

import { SkinChooser } from './SkinChooser'

vi.mock(
  '@/bridge/NativeSoundScraper',
  () => import('@test/fakes/NativeSoundScraper'),
)
vi.mock('@/bridge/NativeSkins', () => import('@test/fakes/NativeSkins'))

const summary = (extra: Partial<SkinSummary>): SkinSummary => ({
  id: 'com.example.skin',
  name: 'Example',
  author: null,
  version: null,
  dir: '/skins/example',
  builtin: false,
  error: null,
  ...extra,
})

/** Settings › Skin with `skin` in use: an installed id, a folder or Default. */
const showSkinSettings = async (skin: string | null) => {
  fakeCore.setSettings({ skin })
  skinStore.set({ ...testSkin(), name: 'Mine' })
  await render(
    <SkinProvider>
      <SkinChooser textStyle={{}} />
    </SkinProvider>,
  )
  // The installed skins load in the background.
  await screen.findByText(/Default$/)
}

describe('the skin chooser', () => {
  beforeEach(() => {
    fakeCore.reset()
    fakeSkins.reset()
    fakeSkins.setInstalledSkins([
      summary({ id: 'default', name: 'Default', builtin: true }),
      summary({}),
    ])
  })

  describe('given a skin folder on macOS or Linux is in use', () => {
    it('shows it as a skin being made, live from its folder', async () => {
      await showSkinSettings('/Users/me/Skins/Mine')
      expect(screen.getByText('Live from Mine')).toBeOnTheScreen()
    })
  })

  describe('given a skin folder on Windows is in use', () => {
    it('shows it as a skin being made, live from its folder', async () => {
      await showSkinSettings('C:\\Skins\\Mine')
      expect(screen.getByText('Live from Mine')).toBeOnTheScreen()
    })
  })

  describe('given an installed skin is in use', () => {
    beforeEach(async () => {
      await showSkinSettings('com.example.skin')
    })

    it('marks it as the one in use', () => {
      expect(screen.getByText('◉ Example')).toBeOnTheScreen()
    })

    it('shows no skin being made', () => {
      expect(screen.queryByText(/^Live from/)).not.toBeOnTheScreen()
    })
  })

  describe('given the Default skin is in use', () => {
    beforeEach(async () => {
      await showSkinSettings(null)
    })

    it('marks Default as the one in use', () => {
      expect(screen.getByText('◉ Default')).toBeOnTheScreen()
    })

    it('shows no skin being made', () => {
      expect(screen.queryByText(/^Live from/)).not.toBeOnTheScreen()
    })
  })

  describe('given the installed skins cannot be read', () => {
    it('says so, with a Retry that reads them again', async () => {
      fakeSkins.native.listSkins.mockRejectedValueOnce(new Error('disk gone'))
      fakeCore.setSettings({ skin: null })
      skinStore.set(testSkin())
      await render(
        <SkinProvider>
          <SkinChooser textStyle={{}} />
        </SkinProvider>,
      )
      expect(
        await screen.findByText("Couldn't list the skins: disk gone"),
      ).toBeOnTheScreen()
      await userEvent.setup().press(screen.getByText('Retry'))
      expect(await screen.findByText('◉ Default')).toBeOnTheScreen()
    })
  })
})
