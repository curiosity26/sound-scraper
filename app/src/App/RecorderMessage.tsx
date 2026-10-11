import type { FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import { colors } from '@/theme/colors'

import { useRecorderSession } from './RecorderSession'
import { useAppearance } from './useAppearance'

/** The latest recorder or library message, if any. */
export const RecorderMessage: FC = () => {
  const { message } = useRecorderSession()
  const { textStyle } = useAppearance()
  if (!message) {
    return null
  }
  return (
    <Text
      testID="recorder-message"
      selectable
      style={[styles.message, textStyle, message.isError && styles.error]}
    >
      {message.text}
    </Text>
  )
}

const styles = StyleSheet.create({
  message: { marginTop: 12, fontSize: 13, lineHeight: 18 },
  error: { color: colors.error },
})
