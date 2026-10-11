import type { FC } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { useAppearance } from '@/App/useAppearance'
import { useCaptureSources } from '@/App/useCaptureSources'
import { useRecorderSession } from '@/App/useRecorderSession'
import { colors } from '@/theme/colors'

import { SourceRow } from './SourceRow'

/** "All system audio" or one app; apps playing sound are marked ♪. */
export const SourcePicker: FC = () => {
  const { apps, selectedPid, select, refresh } = useCaptureSources()
  const recorder = useRecorderSession()
  const { textStyle } = useAppearance()
  const disabled = recorder.state !== 'idle' || recorder.starting
  return (
    <View style={disabled && styles.disabled}>
      <View style={styles.headerRow}>
        <Text style={[styles.section, textStyle]}>Source</Text>
        <Pressable onPress={refresh} disabled={disabled}>
          <Text style={styles.link}>Refresh</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.list}>
        <SourceRow
          label="All system audio"
          selected={selectedPid === 0}
          onPress={() => {
            select(0)
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
              select(app.pid)
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
