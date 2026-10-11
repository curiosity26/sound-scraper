import { type FC, useState } from 'react'
import { Text, View } from 'react-native'

import { settingsStyles } from '@/components/SettingsPanel/styles'
import { useSettingsPanel } from '@/components/SettingsPanel/useSettingsPanel'
import { TextLink } from '@/components/TextLink'

import { useMastersUsage } from './useMastersUsage'

/** How many masters are kept and their size, and deleting them all (after
 * a confirmation). */
export const MastersStorage: FC = () => {
  const { textStyle } = useSettingsPanel()
  const { usage, deleteAll } = useMastersUsage()
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <Text style={[settingsStyles.note, textStyle]}>
        {usage.count === 0
          ? 'No masters are kept right now.'
          : `${usage.count} ${
              usage.count === 1 ? 'master' : 'masters'
            }, ${formatBytes(
              usage.bytes,
            )}. The oldest go first when space runs out; a master goes with its recording.`}
      </Text>
      {usage.count > 0 &&
        (confirming ? (
          <View style={settingsStyles.row}>
            <Text style={[settingsStyles.note, textStyle]}>
              Delete every master? Recordings stay.
            </Text>
            <TextLink
              label="Delete"
              onPress={() => {
                setConfirming(false)
                deleteAll()
              }}
            />
            <TextLink
              label="Cancel"
              onPress={() => {
                setConfirming(false)
              }}
            />
          </View>
        ) : (
          <TextLink
            label="Delete all masters…"
            onPress={() => {
              setConfirming(true)
            }}
          />
        ))}
    </>
  )
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  }
  return `${Math.round(bytes / 1024 ** 2)} MB`
}
