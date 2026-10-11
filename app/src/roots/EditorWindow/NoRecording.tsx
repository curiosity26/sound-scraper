import type { FC } from 'react'
import { Text, View } from 'react-native'

import { usePanelText } from '@/features/skins/hooks/usePanelText'
import { styles } from '@/shared/theme/styles'

/** The editor with nothing open: how to choose a recording. */
export const NoRecording: FC = () => {
  const { fg } = usePanelText('editor')
  return (
    <View style={styles.content}>
      <Text style={[styles.message, fg]}>
        Choose Edit Track… in a recording's details to edit it here.
      </Text>
    </View>
  )
}
