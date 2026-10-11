import type { FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { usePanelTheme } from '@/shared/hooks/usePanelTheme'
import { colors } from '@/shared/theme/colors'

export type InsertMarkerProps = {
  /** Where the dragged rows would land, from the top of the list box. */
  readonly top: number
}

/** The line showing where dragged rows will be dropped. */
export const InsertMarker: FC<InsertMarkerProps> = props => {
  const theme = usePanelTheme()
  const pc = theme?.playlist ?? {}
  return (
    <View
      pointerEvents="none"
      style={[
        styles.insert,
        {
          top: props.top,
          backgroundColor: pc.insert ?? theme?.accent ?? colors.accent,
        },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  insert: { position: 'absolute', left: 0, right: 0, height: 2 },
})
