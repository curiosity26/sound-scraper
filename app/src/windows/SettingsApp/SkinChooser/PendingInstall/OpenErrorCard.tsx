import type { FC } from 'react'
import { Text, View } from 'react-native'

import { TextLink } from '@/components/TextLink'
import { usePanelStyles } from '@/hooks/usePanelStyles'
import { pendingInstall } from '@/skin/pendingInstall'
import { baseName } from '@/windows/SettingsApp/SkinChooser/baseName'
import { styles } from '@/windows/SettingsApp/SkinChooser/styles'
import { useSkinChooser } from '@/windows/SettingsApp/SkinChooser/useSkinChooser'

export type OpenErrorCardProps = {
  /** The .sskin that couldn't be read. */
  readonly path: string
  readonly error: string
}

/** A .sskin that couldn't be opened: why, and Dismiss. */
export const OpenErrorCard: FC<OpenErrorCardProps> = props => {
  const { textStyle } = useSkinChooser()
  const t = usePanelStyles()
  return (
    <View style={[styles.card, styles.installCard, t.border]}>
      <Text style={[styles.title, textStyle]}>
        Couldn't open {baseName(props.path)}
      </Text>
      <Text selectable style={styles.error}>
        {props.error}
      </Text>
      <TextLink
        label="Dismiss"
        onPress={() => {
          pendingInstall.set(null)
        }}
      />
    </View>
  )
}
