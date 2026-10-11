import type { FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { useDetailsPane } from '@/components/DetailsPane/useDetailsPane'
import { formatDate } from '@/library/formatDate'
import { formatDuration } from '@/library/formatDuration'
import { formatSize } from '@/library/formatSize'

import { Info } from './Info'

/** One recording's duration, size, date and file name. */
export const FileInfo: FC = () => {
  const { recording } = useDetailsPane()
  if (!recording) {
    return null
  }
  return (
    <View style={styles.info}>
      <Info label="Duration" value={formatDuration(recording.durationMs)} />
      <Info label="Size" value={formatSize(recording.sizeBytes)} />
      <Info label="Recorded" value={formatDate(recording.recordedAtMs)} />
      <Info label="File" value={recording.fileName} />
    </View>
  )
}

const styles = StyleSheet.create({
  info: { marginTop: 8, gap: 2 },
})
