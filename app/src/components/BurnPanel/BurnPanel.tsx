// The burn panel (docs/playlists-and-cd-burning-design.md §6): choose where
// to burn a playlist, then watch it go track by track, ImgBurn style, with
// the phase, total and buffer bars, speed and a log.
import { type FC, useSyncExternalStore } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { burnJob } from '@/burn/burnJob'
import { burnTarget } from '@/skin/burnTarget'

import { commonStyles } from './commonStyles'
import { Progress } from './Progress'
import { Setup } from './Setup'
import { useBurnTheme } from './useBurnTheme'

export const BurnPanel: FC = () => {
  const target = useSyncExternalStore(burnTarget.subscribe, burnTarget.get)
  const current = useSyncExternalStore(burnJob.subscribe, burnJob.get)
  const th = useBurnTheme()

  if (current) {
    return <Progress key={current.id} th={th} current={current} />
  }
  if (!target) {
    return (
      <View style={commonStyles.root}>
        <Text style={[styles.note, { color: th.text }]}>
          Show a playlist in the library and choose Burn CD… to burn it here.
        </Text>
      </View>
    )
  }
  return <Setup key={target.playlistId} th={th} target={target} />
}

const styles = StyleSheet.create({
  note: { fontSize: 13, lineHeight: 18 },
})
