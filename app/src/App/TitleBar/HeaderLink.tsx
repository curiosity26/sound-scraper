import type { FC } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import type { OverlayName } from '@/App/overlay'
import { useOverlay } from '@/App/useOverlay'
import { colors } from '@/theme/colors'

export type HeaderLinkProps = {
  readonly label: string
  /** The panel the link opens. */
  readonly opens: OverlayName
}

/** A title-bar link that opens a side panel. */
export const HeaderLink: FC<HeaderLinkProps> = props => {
  const { open } = useOverlay()
  return (
    <Pressable
      onPress={() => {
        open(props.opens)
      }}
      testID={`open-${props.opens}`}
    >
      <Text style={styles.link}>{props.label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  link: { color: colors.accent, fontSize: 13 },
})
