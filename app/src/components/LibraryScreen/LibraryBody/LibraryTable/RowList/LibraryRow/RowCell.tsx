import React, { type FC } from 'react'
import { type StyleProp, StyleSheet, Text, type TextStyle } from 'react-native'

export type RowCellProps = {
  /** The row's text look (selected, missing…). */
  readonly textStyle: StyleProp<TextStyle>
  /** The column's flex, matching its heading. */
  readonly flex?: number
  /** Extra style for this column (its width, or dimmed). */
  readonly style?: StyleProp<TextStyle>
  readonly children: React.ReactNode
}

/** One cell of a row: a single line of text. */
export const RowCell: FC<RowCellProps> = props => (
  <Text
    style={[
      styles.cell,
      props.style,
      props.textStyle,
      props.flex !== undefined && { flex: props.flex },
    ]}
    numberOfLines={1}
  >
    {props.children}
  </Text>
)

const styles = StyleSheet.create({
  cell: { fontSize: 13 },
})
