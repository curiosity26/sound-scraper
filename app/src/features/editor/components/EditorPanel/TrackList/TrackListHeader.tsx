import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { useEditor } from '@/features/editor/components/EditorPanel/useEditor'

import { listStyles } from './styles'

/** The column headings. */
export const TrackListHeader: FC = () => {
  const { th } = useEditor()
  const columns = [
    [listStyles.colNum, '#'],
    [listStyles.colName, 'Title and file name'],
    [listStyles.colTime, 'Start'],
    [listStyles.colTime, 'Length'],
  ] as const
  return (
    <View
      style={[
        listStyles.trackRow,
        styles.trackHeader,
        { borderBottomColor: th.border },
      ]}
    >
      {columns.map(([column, label]) => (
        <Text
          key={label}
          style={[column, styles.headerText, { color: th.dim }]}
        >
          {label}
        </Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  trackHeader: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerText: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
})
