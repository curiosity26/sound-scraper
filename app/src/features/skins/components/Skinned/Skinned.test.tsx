import { act, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSkins } from '@test/fakes/NativeSkins'
import { fakeCore } from '@test/fakes/NativeSoundScraper'
import { testSkin } from '@test/fixtures/testSkin'

vi.mock(
  '@/bridge/NativeSoundScraper',
  () => import('@test/fakes/NativeSoundScraper'),
)
vi.mock('@/bridge/NativeSkins', () => import('@test/fakes/NativeSkins'))

// The skin store keeps the skin (and its first load) in its module, so each
// test loads it afresh. The faked native modules load first, once, so the
// app and the test share the fakes imported above.
const loadApp = async () => {
  await Promise.all([
    import('@/bridge/NativeSoundScraper'),
    import('@/bridge/NativeSkins'),
  ])
  vi.resetModules()
  const [skinned, store] = await Promise.all([
    import('./Skinned'),
    import('@/features/skins/skinStore'),
  ])
  fakeCore.reset()
  fakeSkins.reset()
  return { Skinned: skinned.Skinned, skinStore: store.skinStore }
}

type App = Awaited<ReturnType<typeof loadApp>>

/** A window's content, skinned, before any skin has loaded. */
const showWindow = (app: App) => {
  const { Skinned } = app
  return render(
    <Skinned>
      <Text>Content</Text>
    </Skinned>,
  )
}

describe('a skinned window', () => {
  let app: App

  beforeEach(async () => {
    app = await loadApp()
  })

  describe('given the chosen skin loads', () => {
    beforeEach(async () => {
      fakeSkins.setCurrentSkin(testSkin())
      await showWindow(app)
    })

    it('shows its content in the skin', async () => {
      expect(await screen.findByText('Content')).toBeOnTheScreen()
    })

    it('loads the skin once for two windows', async () => {
      await showWindow(app)
      await screen.findAllByText('Content')
      expect(fakeSkins.native.loadCurrentSkin).toHaveBeenCalledTimes(1)
    })
  })

  describe("given the chosen skin can't load", () => {
    beforeEach(async () => {
      await showWindow(app)
    })

    it('says why instead of the content', async () => {
      expect(
        await screen.findByText("Couldn't load the skin: Not faked"),
      ).toBeOnTheScreen()
      expect(screen.queryByText('Content')).not.toBeOnTheScreen()
    })

    describe('when a skin loads later (a skin folder reloading)', () => {
      beforeEach(async () => {
        await screen.findByText("Couldn't load the skin: Not faked")
        await act(() => {
          app.skinStore.set(testSkin())
        })
      })

      it('shows the content', () => {
        expect(screen.getByText('Content')).toBeOnTheScreen()
      })
    })
  })
})
