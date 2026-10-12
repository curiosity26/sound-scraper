import { render, screen, userEvent } from '@testing-library/react-native'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SkinProvider } from '@/features/skins/components/Skinned/SkinProvider'
import { skinStore } from '@/features/skins/skinStore'
import { fakeSkins } from '@test/fakes/NativeSkins'
import { fakeCore } from '@test/fakes/NativeSoundScraper'
import { testSkin } from '@test/fixtures/testSkin'

import { MainPanel } from './MainPanel'

vi.mock(
  '@/bridge/NativeSoundScraper',
  () => import('@test/fakes/NativeSoundScraper'),
)
vi.mock('@/bridge/NativeSkins', () => import('@test/fakes/NativeSkins'))

const renderMainPanel = () =>
  render(
    <SkinProvider>
      <MainPanel />
    </SkinProvider>,
  )

describe('the main panel', () => {
  beforeEach(() => {
    fakeCore.reset()
    fakeSkins.reset()
    skinStore.set(testSkin())
  })

  describe('when Record is pressed', () => {
    it('starts recording all system audio', async () => {
      const user = userEvent.setup()
      await renderMainPanel()
      await user.press(screen.getByRole('button', { name: 'Record' }))
      expect(fakeCore.native.recorderStart).toHaveBeenCalledWith(0)
    })
  })
})
