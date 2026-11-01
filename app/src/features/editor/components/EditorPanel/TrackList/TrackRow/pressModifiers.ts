import type { GestureResponderEvent } from 'react-native'

import type { TrackPressModifiers } from '@/features/editor/components/EditorPanel/useEditorCommands'

const held = (e: GestureResponderEvent, key: string): boolean =>
  Reflect.get(e.nativeEvent, key) === true

/**
 * The keys held during a click. macOS and Windows add them to press events
 * (not in React Native's types); elsewhere none are seen.
 */
export const pressModifiers = (
  e: GestureResponderEvent,
): TrackPressModifiers => {
  return {
    extend: held(e, 'shiftKey'),
    toggle: held(e, 'metaKey') || held(e, 'ctrlKey'),
  }
}
