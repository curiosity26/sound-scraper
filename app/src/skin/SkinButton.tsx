// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React from 'react'
import { Pressable } from 'react-native'

import { scaleRect, SpriteCell, useSkinScale } from './SkinImage'
import type { SkinElement } from './types'

type Props = {
  element: SkinElement
  onPress: () => void
  /** Latched on (a panel open…). */
  active?: boolean
  /**
   * A mode with its own look, e.g. "recording" for the record button: the
   * sprite's "recording"/"recordingPressed" states, falling back to
   * active/pressed.
   */
  mode?: string
  disabled?: boolean
  testID?: string
  accessibilityLabel: string
}

/** Picks the best sprite state for a button, falling back toward "normal". */
export function buttonState(
  states: Record<string, unknown>,
  flags: {
    pressed: boolean
    active: boolean
    disabled: boolean
    mode?: string
  },
): string {
  const { mode } = flags
  // A disabled button in a mode keeps the mode's look (record stays lit
  // while recording).
  const candidates = flags.disabled
    ? mode
      ? [`${mode}Disabled`, mode, 'disabled']
      : ['disabled']
    : mode && flags.pressed
    ? [`${mode}Pressed`, 'activePressed', 'pressed']
    : mode
    ? [mode, 'active']
    : flags.pressed && flags.active
    ? ['activePressed', 'pressed', 'active']
    : flags.pressed
    ? ['pressed']
    : flags.active
    ? ['active']
    : []
  return candidates.find(s => s in states) ?? 'normal'
}

/**
 * A skin button: the element's sprite cell for its state (normal, pressed,
 * active, activePressed, disabled), or an invisible hot spot when the skin
 * paints the button into its background.
 */
export function SkinButton(props: Props): React.JSX.Element {
  const { element, active = false, disabled = false } = props
  const [, , w, h] = element.rect
  const s = useSkinScale()
  const sprite = element.sprite
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      onPress={props.onPress}
      disabled={disabled}
      style={scaleRect(element.rect, s)}
    >
      {({ pressed }) => {
        if (!sprite) {
          return null
        }
        const state = buttonState(sprite.states, {
          pressed,
          active,
          disabled,
          mode: props.mode,
        })
        const dim = disabled && state === 'normal'
        return (
          <SpriteCell
            image={sprite.image}
            at={sprite.states[state]}
            size={[w, h]}
            style={dim ? { opacity: 0.5 } : undefined}
          />
        )
      }}
    </Pressable>
  )
}
