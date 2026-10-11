// Colors for the library and settings content, from the skin's panel
// table/controls colors. Without a provider (the plain UI), components keep
// their own styles: every style here is then empty.
import { useMemo } from 'react'
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native'

import { usePanelTheme } from './usePanelTheme'

export type UsePanelStylesResult = {
  /** Table rows (and header) padding. */
  readonly row: ViewStyle
  /** Table cells and check boxes. */
  readonly cell: TextStyle
  readonly text: TextStyle
  readonly link: TextStyle
  readonly input: TextStyle
  readonly button: ViewStyle
  readonly buttonText: TextStyle
  readonly border: ViewStyle
  readonly panel: ViewStyle
  readonly table: ViewStyle
  readonly header: ViewStyle
  readonly headerText: TextStyle
  readonly rowAlternate: ViewStyle
  readonly rowSelected: ViewStyle
  readonly selectedText: TextStyle
  readonly tableText: TextStyle
  readonly grid: ViewStyle
}

const NONE: UsePanelStylesResult = {
  row: {},
  cell: {},
  text: {},
  link: {},
  input: {},
  button: {},
  buttonText: {},
  border: {},
  panel: {},
  table: {},
  header: {},
  headerText: {},
  rowAlternate: {},
  rowSelected: {},
  selectedText: {},
  tableText: {},
  grid: {},
}

/** Style fragments to append to a component's own styles. */
export const usePanelStyles = (): UsePanelStylesResult => {
  const t = usePanelTheme()
  return useMemo(() => {
    if (!t) {
      return NONE
    }
    const tb = t.table
    const small = t.compact === true
    return {
      row: small ? { paddingVertical: 3, paddingHorizontal: 6 } : {},
      cell: small ? { fontSize: 11 } : {},
      text: { color: t.text },
      link: { color: t.accent },
      input: {
        color: t.text,
        backgroundColor: t.background,
        borderColor: t.border,
        ...(small ? { fontSize: 11, paddingVertical: 2 } : {}),
      },
      button: { backgroundColor: t.button },
      buttonText: { color: t.buttonText },
      border: { borderColor: t.border, borderLeftColor: t.border },
      panel: { backgroundColor: t.background },
      table: { backgroundColor: tb.background },
      header: {
        backgroundColor: tb.header,
        borderBottomColor: tb.grid,
      },
      headerText: {
        color: tb.headerText,
        opacity: 1,
        ...(small ? { fontSize: 10 } : {}),
      },
      rowAlternate: { backgroundColor: tb.alternate },
      rowSelected: { backgroundColor: tb.selection },
      selectedText: { color: tb.selectionText },
      tableText: { color: tb.text },
      grid: {
        borderBottomColor: tb.grid,
        borderBottomWidth: StyleSheet.hairlineWidth,
      },
    }
  }, [t])
}
