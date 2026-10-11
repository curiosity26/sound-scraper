import type { FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { BurnTheme, Device } from '@/burn/types'

import { commonStyles } from './commonStyles'

export type DeviceListProps = {
  readonly th: BurnTheme
  readonly devices: readonly Device[]
  readonly deviceId: string | undefined
  readonly onSelect: (id: string) => void
}

/** "Write to": the drives and the image writer, one chosen. */
export const DeviceList: FC<DeviceListProps> = props => {
  const { th, devices, deviceId } = props
  const fg = { color: th.text }
  return (
    <View style={[styles.devices, { borderColor: th.border }]}>
      {devices.map(d => (
        <Pressable
          key={d.id}
          testID={`burn-device-${d.id}`}
          onPress={() => {
            props.onSelect(d.id)
          }}
          style={[
            styles.device,
            d.id === deviceId && { backgroundColor: th.accent + '33' },
          ]}
        >
          <Text style={[styles.radio, fg]}>
            {d.id === deviceId ? '◉' : '○'}
          </Text>
          <View style={commonStyles.flex}>
            <Text style={[styles.deviceName, fg]}>{d.name}</Text>
            <Text style={[commonStyles.small, { color: th.dim }]}>
              {d.media.label}
            </Text>
          </View>
        </Pressable>
      ))}
      {devices.length > 0 && !devices.some(d => d.kind === 'drive') && (
        <Text style={[commonStyles.small, styles.noDrive, { color: th.dim }]}>
          No CD burner found. Plug one in and it shows up here.
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  devices: { borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
  device: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6 },
  deviceName: { fontSize: 13, fontWeight: '600' },
  radio: { fontSize: 13, width: 16 },
  noDrive: { padding: 6, fontStyle: 'italic' },
})
