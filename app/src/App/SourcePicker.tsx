import type { FC } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import type { AudioApp } from '@/native/types'
import { colors } from '@/theme/colors'

import { SourceRow } from './SourceRow'

export type SourcePickerProps = {
  readonly apps: readonly AudioApp[]
  /** 0 = all system audio. */
  readonly selectedPid: number
  readonly onSelect: (pid: number) => void
  readonly onRefresh: () => void
  readonly disabled: boolean
  readonly textStyle: object
}

/** "All system audio" or one app; apps playing sound are marked ♪. */
export const SourcePicker: FC<SourcePickerProps> = props => {
  const { apps, selectedPid, onSelect, onRefresh, disabled, textStyle } = props
  return (
    <View style={disabled && styles.disabled}>
      <View style={styles.headerRow}>
        <Text style={[styles.section, textStyle]}>Source</Text>
        <Pressable onPress={onRefresh} disabled={disabled}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.list}>
        <SourceRow
          label="All system audio"
          selected={selectedPid === 0}
          onPress={() => {
            onSelect(0)
          }}
          disabled={disabled}
          textStyle={textStyle}
        />
        {apps.map(app => (
          <SourceRow
            key={app.pid}
            label={`${app.isPlaying ? '♪ ' : ''}${app.name}`}
            selected={selectedPid === app.pid}
            onPress={() => {
              onSelect(app.pid)
            }}
            disabled={disabled}
            textStyle={textStyle}
          />
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.5 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  section: { fontSize: 16, fontWeight: '600' },
  link: { color: colors.accent, fontSize: 14 },
  list: {
    flexGrow: 0,
    maxHeight: 150,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 6,
  },
})
