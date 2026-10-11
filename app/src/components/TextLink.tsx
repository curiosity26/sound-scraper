import type { FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { usePanelStyles } from '@/hooks/usePanelStyles'
import { colors } from '@/theme/colors'

export type TextLinkProps = {
  readonly label: string
  readonly onPress: () => void
  /** The link's testID. Not a `testID` prop here, so a test finds the
   * pressable itself rather than this wrapper. */
  readonly testName?: string
}

/** A text link in a panel (accent colored, or the skin's link color). */
export const TextLink: FC<TextLinkProps> = props => {
  const t = usePanelStyles()
  return (
    <Pressable onPress={props.onPress} testID={props.testName}>
      <Text style={[styles.link, t.link]}>{props.label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  link: { color: colors.accent, fontSize: 13 },
})
