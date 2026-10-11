import type { FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { usePanelStyles } from '@/hooks/usePanelStyles'

export type InfoProps = {
  readonly label: string
  readonly value: string
  readonly textStyle: object
}

/** One line of file info: a label and a selectable value. */
export const Info: FC<InfoProps> = props => {
  const t = usePanelStyles()
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, props.textStyle, t.cell]}>
        {props.label}
      </Text>
      <Text
        selectable
        style={[styles.infoValue, props.textStyle, t.cell]}
        numberOfLines={2}
      >
        {props.value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  infoRow: { flexDirection: 'row', gap: 8 },
  infoLabel: { width: 64, fontSize: 11, opacity: 0.6 },
  infoValue: { flex: 1, fontSize: 11 },
})
