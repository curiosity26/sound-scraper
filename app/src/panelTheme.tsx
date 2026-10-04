// Colors for the library and settings content, from the skin's panel
// table/controls colors. Without a provider (the plain UI), components keep
// their own styles: every style here is then empty.
import { createContext, useContext, useMemo } from 'react';
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import type { FramePanel } from './skin/types';

export type PanelTheme = {
  text?: string;
  background?: string;
  border?: string;
  accent?: string;
  button?: string;
  buttonText?: string;
  table: Record<string, string | undefined>;
  scrollbar: FramePanel['scrollbar'];
};

const PanelThemeContext = createContext<PanelTheme | undefined>(undefined);
export const PanelThemeProvider = PanelThemeContext.Provider;
export const usePanelTheme = () => useContext(PanelThemeContext);

export function themeFromPanel(panel: FramePanel): PanelTheme {
  const c = panel.controls;
  return {
    text: c.text,
    background: c.background,
    border: c.border,
    accent: c.accent,
    button: c.button,
    buttonText: c.buttonText,
    table: panel.table,
    scrollbar: panel.scrollbar,
  };
}

type Styles = {
  text: TextStyle;
  link: TextStyle;
  input: TextStyle;
  button: ViewStyle;
  buttonText: TextStyle;
  border: ViewStyle;
  panel: ViewStyle;
  table: ViewStyle;
  header: ViewStyle;
  headerText: TextStyle;
  rowAlternate: ViewStyle;
  rowSelected: ViewStyle;
  selectedText: TextStyle;
  tableText: TextStyle;
  grid: ViewStyle;
};

const NONE: Styles = {
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
};

/** Style fragments to append to a component's own styles. */
export function usePanelStyles(): Styles {
  const t = usePanelTheme();
  return useMemo(() => {
    if (!t) {
      return NONE;
    }
    const tb = t.table;
    return {
      text: { color: t.text },
      link: { color: t.accent },
      input: {
        color: t.text,
        backgroundColor: t.background,
        borderColor: t.border,
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
      headerText: { color: tb.headerText, opacity: 1 },
      rowAlternate: { backgroundColor: tb.alternate },
      rowSelected: { backgroundColor: tb.selection },
      selectedText: { color: tb.selectionText },
      tableText: { color: tb.text },
      grid: {
        borderBottomColor: tb.grid,
        borderBottomWidth: StyleSheet.hairlineWidth,
      },
    };
  }, [t]);
}
