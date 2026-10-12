import { render, screen, userEvent } from '@testing-library/react-native'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeCore } from '@test/fakes/NativeSoundScraper'

import { SettingsPanel } from './SettingsPanel'

vi.mock(
  '@/bridge/NativeSoundScraper',
  () => import('@test/fakes/NativeSoundScraper'),
)

const showSettings = async () => {
  await render(<SettingsPanel textStyle={{}} />)
}

describe('the settings panel', () => {
  beforeEach(() => {
    fakeCore.reset()
  })

  describe('given the default settings', () => {
    beforeEach(showSettings)

    it('offers each MP3 quality as a radio button, 192 kbps checked', () => {
      expect(
        screen.getByRole('radio', { name: '192 kbps', checked: true }),
      ).toBeOnTheScreen()
      expect(
        screen.getByRole('radio', { name: '320 kbps', checked: false }),
      ).toBeOnTheScreen()
    })

    it('offers trimming silence as a checked check box', () => {
      expect(
        screen.getByRole('checkbox', { name: 'Trim silence', checked: true }),
      ).toBeOnTheScreen()
    })

    it('describes each choice in its hint', () => {
      expect(screen.getByRole('radio', { name: '320 kbps' })).toHaveProp(
        'accessibilityHint',
        'Constant bitrate · largest',
      )
    })
  })

  describe('when I choose 320 kbps', () => {
    beforeEach(async () => {
      await showSettings()
      await userEvent.press(screen.getByRole('radio', { name: '320 kbps' }))
    })

    it('checks it instead of 192 kbps', async () => {
      expect(
        await screen.findByRole('radio', { name: '320 kbps', checked: true }),
      ).toBeOnTheScreen()
      expect(
        screen.getByRole('radio', { name: '192 kbps', checked: false }),
      ).toBeOnTheScreen()
    })
  })

  describe('when I uncheck Trim silence', () => {
    beforeEach(async () => {
      await showSettings()
      await userEvent.press(
        screen.getByRole('checkbox', { name: 'Trim silence' }),
      )
    })

    it('shows it unchecked', async () => {
      expect(
        await screen.findByRole('checkbox', {
          name: 'Trim silence',
          checked: false,
        }),
      ).toBeOnTheScreen()
    })
  })
})
