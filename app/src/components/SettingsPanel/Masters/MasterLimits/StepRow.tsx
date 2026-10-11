import type { FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { settingsStyles } from '@/components/SettingsPanel/styles'
import { useSettingsPanel } from '@/components/SettingsPanel/useSettingsPanel'
import { usePanelStyles } from '@/hooks/usePanelStyles'

export type StepRowProps = {
  readonly label: string
  readonly value: string
  readonly onStep: (dir: 1 | -1) => void
  readonly disabled: boolean
}

/** A label, and its value between − and + buttons. */
export const StepRow: FC<StepRowProps> = props => {
  const { label, value, onStep, disabled } = props
  const { textStyle } = useSettingsPanel()
  const t = usePanelStyles()
  return (
    <View style={[settingsStyles.row, styles.stepRow]}>
      <Text style={[styles.stepLabel, textStyle]}>{label}</Text>
      <Pressable
        onPress={() => {
          onStep(-1)
        }}
        disabled={disabled}
      >
        <Text style={[settingsStyles.link, t.link, disabled && styles.dim]}>
          −
        </Text>
      </Pressable>
      <Text style={[styles.stepValue, textStyle, disabled && styles.dim]}>
        {value}
      </Text>
      <Pressable
        onPress={() => {
          onStep(1)
        }}
        disabled={disabled}
      >
        <Text style={[settingsStyles.link, t.link, disabled && styles.dim]}>
          +
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  stepRow: { alignItems: 'center', gap: 10, paddingVertical: 2 },
  stepLabel: { fontSize: 13, width: 100 },
  stepValue: { fontSize: 13, minWidth: 80, textAlign: 'center' },
  dim: { opacity: 0.4 },
})
