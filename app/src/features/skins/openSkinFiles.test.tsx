import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SkinInspection } from '@/bridge/generated'
import { settingsTab } from '@/features/settings/settingsTab'
import { SkinChooser } from '@/features/skins/components/SkinChooser'
import { SkinProvider } from '@/features/skins/components/Skinned/SkinProvider'
import { pendingInstall } from '@/features/skins/pendingInstall'
import { skinStore } from '@/features/skins/skinStore'
import { fakeSkins } from '@test/fakes/NativeSkins'
import { fakeCore } from '@test/fakes/NativeSoundScraper'
import { testSkin } from '@test/fixtures/testSkin'

import { openSkinFiles } from './openSkinFiles'

vi.mock(
  '@/bridge/NativeSoundScraper',
  () => import('@test/fakes/NativeSoundScraper'),
)
vi.mock('@/bridge/NativeSkins', () => import('@test/fakes/NativeSkins'))

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

/** Settings › Skin, where opened skins show up. */
const showSkinSettings = () =>
  render(
    <SkinProvider>
      <SkinChooser textStyle={{}} />
    </SkinProvider>,
  )

const open = (paths: string[]) =>
  act(async () => {
    await openSkinFiles(paths)
  })

describe('opening skin files', () => {
  beforeEach(async () => {
    fakeCore.reset()
    fakeSkins.reset()
    skinStore.set(testSkin())
    pendingInstall.set(null)
    settingsTab.set('settings')
    await showSkinSettings()
  })

  describe('given a skin archive', () => {
    beforeEach(async () => {
      fakeSkins.setInspection('/x/Retro.sskin', retro)
      await open(['/x/Retro.sskin'])
    })

    it('opens the settings', () => {
      expect(fakeSkins.isVisible('settings')).toBe(true)
    })

    it('turns the settings to the Skin tab', () => {
      expect(settingsTab.get()).toBe('skin')
    })

    it('asks whether to install it', () => {
      expect(screen.getByText('Install this skin?')).toBeOnTheScreen()
    })

    it('says which skin it is', () => {
      expect(screen.getByText('Retro 1.0')).toBeOnTheScreen()
    })
  })

  describe('given a .zip archive, in capitals', () => {
    it('asks whether to install it', async () => {
      fakeSkins.setInspection('C:\\x\\SKIN.ZIP', retro)
      await open(['C:\\x\\SKIN.ZIP'])
      expect(screen.getByText('Install this skin?')).toBeOnTheScreen()
    })
  })

  describe("given an archive that isn't a skin", () => {
    beforeEach(async () => {
      fakeSkins.setInspection(
        '/x/Broken.sskin',
        new Error('skin.json is missing'),
      )
      await open(['/x/Broken.sskin'])
    })

    it("says it couldn't open it", () => {
      expect(screen.getByText("Couldn't open Broken.sskin")).toBeOnTheScreen()
    })

    it('says why', () => {
      expect(screen.getByText('skin.json is missing')).toBeOnTheScreen()
    })
  })

  describe('given a skin folder', () => {
    beforeEach(async () => {
      fakeSkins.setCurrentSkin({ ...testSkin(), name: 'Mine' })
      await open(['/x/My Skin'])
    })

    it('uses it straight away', () => {
      expect(fakeCore.settings().skin).toBe('/x/My Skin')
    })

    it("doesn't ask to install it", () => {
      expect(screen.queryByText('Install this skin?')).toBeNull()
    })
  })

  describe('given no files', () => {
    it('leaves the settings closed', async () => {
      await open([])
      expect(fakeSkins.isVisible('settings')).toBe(false)
    })
  })
})
