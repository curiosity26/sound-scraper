import type { FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { formatDate } from '@/features/library/formatDate'
import { formatDuration } from '@/features/library/formatDuration'
import { formatSize } from '@/features/library/formatSize'
import { useDetailsPane } from '@/features/tags/components/DetailsPane/useDetailsPane'

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
