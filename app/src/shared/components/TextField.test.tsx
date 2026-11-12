import { render, screen } from '@testing-library/react-native'
import React from 'react'
import { Platform, StyleSheet } from 'react-native'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { TextField } from './TextField'

const styles = StyleSheet.create({ field: { color: '#222222' } })

/** Runs the tests as if on `os`. */
const onPlatform = (os: typeof Platform.OS) => {
  const real = Platform.OS
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true })
  })
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: real, configurable: true })
  })
}

describe('a text field', () => {
  describe('given Windows', () => {
    onPlatform('windows')

    describe('when it is single-line', () => {
      it('submits on Enter', async () => {
        await render(
          <TextField accessibilityLabel="Name" style={styles.field} />,
        )
        expect(screen.getByLabelText('Name')).toHaveProp('submitKeyEvents', [
          { key: 'Enter' },
        ])
      })

      it('keeps to one line', async () => {
        await render(
          <TextField accessibilityLabel="Name" style={styles.field} />,
        )
        expect(screen.getByLabelText('Name')).toHaveProp('numberOfLines', 1)
      })
    })

    describe('when it is multiline', () => {
      it('takes Enter as a new line', async () => {
        await render(
          <TextField
            accessibilityLabel="Notes"
            style={styles.field}
            multiline
          />,
        )
        expect(screen.getByLabelText('Notes')).not.toHaveProp('submitKeyEvents')
      })
    })
  })

  describe('given macOS', () => {
    onPlatform('macos')

    it('stays a single-line box, which submits on Enter itself', async () => {
      await render(<TextField accessibilityLabel="Name" style={styles.field} />)
      expect(screen.getByLabelText('Name')).not.toHaveProp('multiline', true)
    })

    describe('when a single-line box asks to select its text on focus', () => {
      it('leaves selecting to the native box', async () => {
        await render(
          <TextField
            accessibilityLabel="Name"
            style={styles.field}
            selectTextOnFocus
          />,
        )
        expect(screen.getByLabelText('Name')).toHaveProp(
          'selectTextOnFocus',
          false,
        )
      })
    })

    describe('when a multiline box asks to select its text on focus', () => {
      it('passes the request on', async () => {
        await render(
          <TextField
            accessibilityLabel="Notes"
            style={styles.field}
            multiline
            selectTextOnFocus
          />,
        )
        expect(screen.getByLabelText('Notes')).toHaveProp(
          'selectTextOnFocus',
          true,
        )
      })
    })
  })
})
