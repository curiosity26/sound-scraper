import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useAppearance } from '@/App/useAppearance'

import { HeaderLink } from './HeaderLink'

/** The app name with the Settings and About links. */
export const TitleBar: FC = () => {
  const { textStyle } = useAppearance()
  return (
    <View style={styles.row}>
      <Text style={[styles.title, textStyle]}>Sound Scraper</Text>
      <View style={styles.links}>
        <HeaderLink label="Settings" opens="settings" />
        <HeaderLink label="About" opens="about" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 28, fontWeight: '600' },
  links: { flexDirection: 'row', gap: 16 },
})
