import type { AuxClick } from './types'

/** Where an aux (right) click was, in the window: react-native-gtk4's clientX/Y already are (as on the web). */
export const clickPoint = (
  e: AuxClick,
  _box: { readonly x: number; readonly y: number },
): { x: number; y: number } => ({
  x: e.clientX ?? 0,
  y: e.clientY ?? 0,
})
