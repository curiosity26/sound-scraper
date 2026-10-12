import type { FC } from 'react'
import { Pressable, Text } from 'react-native'

import { doubleSizeStore } from '@/features/skins/doubleSizeStore'
import { useDoubleSize } from '@/features/skins/hooks/useDoubleSize'
import { platformText } from '@/shared/platformText'

import { styles } from './styles'
import { useSkinChooser } from './useSkinChooser'

const modifier = `${platformText.shortcutModifier}D`

/** Double size, with its shortcut (shared by every window). */
export const DoubleSizeToggle: FC = () => {
  const { textStyle } = useSkinChooser()
  const { double } = useDoubleSize()
  return (
    <Pressable
      testID="double-size"
      onPress={() => {
        doubleSizeStore.set(!double)
      }}
      style={styles.toggle}
    >
      <Text style={[styles.label, textStyle]}>
        {double ? '☑' : '☐'} Double size ({modifier})
      </Text>
    </Pressable>
  )
}
