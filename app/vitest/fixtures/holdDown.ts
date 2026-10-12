import { fireEvent, type screen } from '@testing-library/react-native'

type HostElement = ReturnType<typeof screen.getByRole>

/**
 * Presses `element` down and keeps it held (userEvent's press always lets
 * go), so a test can see how a button looks while it is held.
 */
export const holdDown = (element: HostElement) =>
  fireEvent(element, 'responderGrant', {
    persist: () => {},
    currentTarget: { measure: () => {} },
    nativeEvent: {
      timestamp: 0,
      pageX: 0,
      pageY: 0,
      locationX: 0,
      locationY: 0,
      touches: [],
      changedTouches: [],
    },
  })
