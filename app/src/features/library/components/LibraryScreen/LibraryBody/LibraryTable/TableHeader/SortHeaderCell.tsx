import type { FC } from 'react'
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native'

import { useLibraryTable } from '@/features/library/components/LibraryScreen/LibraryBody/LibraryTable/useLibraryTable'
import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'
import type { SortKey } from '@/features/library/types'
import { usePanelStyles } from '@/shared/hooks/usePanelStyles'

export type SortHeaderCellProps = {
  readonly sortKey: SortKey
  readonly label: string
  /** Between the label and the ▲/▼ shown while sorted by this column. */
  readonly gap?: string
  /** The column's width or flex, matching the rows. */
  readonly style: StyleProp<ViewStyle>
}

/** A column heading: press to sort by it (again to reverse). */
export const SortHeaderCell: FC<SortHeaderCellProps> = props => {
  const { sortKey, gap = ' ' } = props
  const { textStyle } = useLibraryScreen()
  const { sort, toggleSort } = useLibraryTable()
  const t = usePanelStyles()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sort by ${props.label}`}
      style={props.style}
      onPress={() => {
        toggleSort(sortKey)
      }}
    >
      <Text style={[styles.text, textStyle, t.headerText]} numberOfLines={1}>
        {props.label}
        {sort.key === sortKey ? gap + (sort.ascending ? '▲' : '▼') : ''}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  text: { fontSize: 12, fontWeight: '600', opacity: 0.7 },
})
