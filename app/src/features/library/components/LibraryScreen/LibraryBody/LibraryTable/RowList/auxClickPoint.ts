import type { AuxClick } from './types'

/**
 * Where a right-click on a row was, in the window: react-native-windows'
 * clientX/Y are in the row, which sits `rowTop` below the list's top
 * (`box`, in the window).
 */
export const auxClickPoint = (
  e: AuxClick,
  box: { readonly x: number; readonly y: number },
  rowTop: number,
): { pageX: number; pageY: number } => ({
  pageX: box.x + (e.clientX ?? 0),
  pageY: box.y + rowTop + (e.clientY ?? 0),
})
