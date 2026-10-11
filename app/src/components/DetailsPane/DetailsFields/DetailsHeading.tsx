import type { FC } from 'react'
import { StyleSheet, Text } from 'react-native'

import { useDetailsPane } from '@/components/DetailsPane/useDetailsPane'
import { displayName } from '@/library/displayName'

import { InlineField } from './InlineField'

/** One recording's file name, edited in place; or how many are selected. */
export const DetailsHeading: FC = () => {
  const { fileNames, recording, rename, textStyle } = useDetailsPane()
  if (fileNames.length !== 1) {
    return (
      <Text style={[styles.bulk, textStyle]}>
        {fileNames.length} recordings
      </Text>
    )
  }
  return (
    <InlineField
      testName="details-name"
      label="File name"
      value={recording ? displayName(recording) : fileNames[0] ?? ''}
      onCommit={rename}
      large
    />
  )
}

const styles = StyleSheet.create({
  bulk: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
})
