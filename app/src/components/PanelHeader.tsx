import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { TextLink } from '@/components/TextLink'

export type PanelHeaderProps = {
  readonly title: string
  /** Names the Done link for tests: `close-<panel>`. */
  readonly panel: 'settings' | 'about'
  /** Without it (the skinned window has its own title and close button)
   * there's no header. */
  readonly onClose?: () => void
  readonly textStyle: object
}

/** A side panel's heading with Done, in the plain UI's overlay. */
export const PanelHeader: FC<PanelHeaderProps> = props => {
  if (!props.onClose) {
    return null
  }
  return (
    <View style={styles.header}>
      <Text style={[styles.heading, props.textStyle]}>{props.title}</Text>
      <TextLink
        label="Done"
        onPress={props.onClose}
        testName={`close-${props.panel}`}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heading: { fontSize: 18, fontWeight: '600' },
})
