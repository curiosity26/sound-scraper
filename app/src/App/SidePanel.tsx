import type { FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { AboutPanel } from '@/components/AboutPanel'
import { SettingsPanel } from '@/components/SettingsPanel'
import { colors } from '@/theme/colors'

import { useAppearance } from './useAppearance'
import { useOverlay } from './useOverlay'

/** Settings or About, over the right side of the window, when open. */
export const SidePanel: FC = () => {
  const { shown, close } = useOverlay()
  const { textStyle, background } = useAppearance()
  if (!shown) {
    return null
  }
  return (
    <View style={[styles.panel, background]}>
      {shown === 'settings' ? (
        <SettingsPanel onClose={close} textStyle={textStyle} />
      ) : (
        <AboutPanel onClose={close} textStyle={textStyle} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 380,
    padding: 20,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
})
