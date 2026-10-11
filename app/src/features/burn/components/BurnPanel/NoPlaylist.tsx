import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { commonStyles } from './commonStyles'
import { useBurnTheme } from './useBurnTheme'

/** The panel with nothing to burn: how to choose a playlist. */
export const NoPlaylist: FC = () => {
  const th = useBurnTheme()
  return (
    <View style={commonStyles.root}>
      <Text style={[styles.note, { color: th.text }]}>
        Show a playlist in the library and choose Burn CD… to burn it here.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  note: { fontSize: 13, lineHeight: 18 },
})
