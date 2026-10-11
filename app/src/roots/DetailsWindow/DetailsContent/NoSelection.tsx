import type { FC } from 'react'
import { Text, View } from 'react-native'

import { usePanelText } from '@/features/skins/hooks/usePanelText'
import { styles } from '@/shared/theme/styles'

/** The details window's hint while nothing is selected. */
export const NoSelection: FC = () => {
  const { fg } = usePanelText('details')
  return (
    <View style={styles.content}>
      <Text style={[styles.message, fg]}>
        Click a recording in the library to see its details.
      </Text>
    </View>
  )
}
