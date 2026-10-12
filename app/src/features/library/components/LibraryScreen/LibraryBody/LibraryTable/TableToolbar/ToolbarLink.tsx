import type { FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { usePanelStyles } from '@/shared/hooks/usePanelStyles'
import { colors } from '@/shared/theme/colors'

export type ToolbarLinkProps = {
  readonly label: string
  readonly accessibilityLabel?: string
  readonly onPress: () => void
}

/** A text link in the table's toolbar. */
export const ToolbarLink: FC<ToolbarLinkProps> = props => {
  const t = usePanelStyles()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      onPress={props.onPress}
    >
      <Text style={[styles.link, t.link, t.cell]}>{props.label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  link: {
    color: colors.accent,
    fontSize: 13,
  },
})
