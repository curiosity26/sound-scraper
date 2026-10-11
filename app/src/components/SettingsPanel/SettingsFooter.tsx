import type { FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import { colors } from '@/theme/colors'

import { settingsStyles } from './styles'
import { useSettingsPanel } from './useSettingsPanel'

/** A note about the remembered capture source, and the last save error. */
export const SettingsFooter: FC = () => {
  const { error, textStyle } = useSettingsPanel()
  return (
    <>
      <Text style={[settingsStyles.note, textStyle]}>
        The last capture source you recorded is remembered and selected again
        when Sound Scraper starts.
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
    </>
  )
}

const styles = StyleSheet.create({
  error: { color: colors.error, fontSize: 12, marginTop: 8 },
})
