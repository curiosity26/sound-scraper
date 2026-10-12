import type { FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { commonStyles } from '@/features/burn/components/BurnPanel/commonStyles'
import { useBurnTheme } from '@/features/burn/components/BurnPanel/useBurnTheme'

import { useBurnSetup } from './useBurnSetup'

/** "Write to": the drives and the image writer, one chosen. */
export const DeviceList: FC = () => {
  const th = useBurnTheme()
  const { devices, deviceId, selectDevice } = useBurnSetup().devices
  const fg = { color: th.text }
  return (
    <View style={[styles.devices, { borderColor: th.border }]}>
      {devices.map(d => (
        <Pressable
          key={d.id}
          accessibilityRole="radio"
          accessibilityState={{ checked: d.id === deviceId }}
          onPress={() => {
            selectDevice(d.id)
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
