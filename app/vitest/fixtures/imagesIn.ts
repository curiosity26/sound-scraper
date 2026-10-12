import type { screen } from '@testing-library/react-native'

type HostElement = ReturnType<typeof screen.getByRole>

/**
 * The images drawn inside `element` (sprite cells, frame pieces…), in
 * drawing order. A sprite cell's image is offset by minus the cell's
 * position in the sheet, so its `left` and `top` say which cell shows.
 */
export const imagesIn = (element: HostElement): HostElement[] =>
  element.queryAll(node => node.type === 'RCTImageView')
