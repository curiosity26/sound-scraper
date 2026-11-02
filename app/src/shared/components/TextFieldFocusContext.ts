import { createContext } from 'react'

/**
 * Told when a TextField inside gains (true) or loses (false) the keyboard
 * focus, e.g. by a view whose single-key shortcuts must stand aside while
 * a field is typed in (on Linux, keys an ancestor claims with
 * keyDownEvents never reach the field).
 */
export const TextFieldFocusContext = createContext<
  ((gained: boolean) => void) | null
>(null)
