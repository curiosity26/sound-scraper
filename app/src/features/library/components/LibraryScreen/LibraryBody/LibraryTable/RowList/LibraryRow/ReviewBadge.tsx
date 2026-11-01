import React, { type FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import { colors } from '@/shared/theme/colors'

/**
 * After the name of a recording with an editor draft (e.g. the splits the
 * recorder proposed from now-playing info): open it in the track editor to
 * review its tracks. Inside the name's text, so it stays on its one line.
 */
export const ReviewBadge: FC = () => (
  <Text style={styles.badge}>
    {'  '}
    Review tracks
  </Text>
)

const styles = StyleSheet.create({
  badge: { fontSize: 10, fontWeight: '600', color: colors.accent },
})
