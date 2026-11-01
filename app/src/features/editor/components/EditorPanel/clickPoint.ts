import type { AuxClick } from './types'

/**
 * Where an aux (right) click was, in the window: macOS' and Windows'
 * clientX/Y are in the clicked view, which sits at `box` in the window.
 */
export const clickPoint = (
  e: AuxClick,
  box: { readonly x: number; readonly y: number },
): { x: number; y: number } => ({
  x: box.x + (e.clientX ?? 0),
  y: box.y + (e.clientY ?? 0),
})
