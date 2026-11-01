import React, { type FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import { CHECK_CUT_COLOR } from '@/features/editor/components/EditorPanel/constants'

/**
 * A subtle flag on a track whose start was guessed from now-playing info
 * (no quiet gap was found near the song change): listen to the cut.
 */
export const CutCheck: FC = () => {
  return (
    <Text accessibilityLabel="Check this cut" style={styles.pill}>
      check cut
    </Text>
  )
}

const styles = StyleSheet.create({
  pill: {
    fontSize: 9,
    color: CHECK_CUT_COLOR,
    borderColor: CHECK_CUT_COLOR,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 5,
    overflow: 'hidden',
  },
})
