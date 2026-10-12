import type { AuxClick } from './types'

/** Where a right-click on a row was, in the window: react-native-gtk4's clientX/Y are (as on the web). */
export const auxClickPoint = (
  e: AuxClick,
  _box: { readonly x: number; readonly y: number },
  _rowTop: number,
): { pageX: number; pageY: number } => ({
  pageX: e.clientX ?? 0,
  pageY: e.clientY ?? 0,
})
