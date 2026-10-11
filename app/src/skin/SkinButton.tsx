// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React from 'react'
import { Pressable } from 'react-native'

import { buttonState } from './buttonState'
import { scaleRect } from './scaleRect'
import { SpriteCell } from './SpriteCell'
import type { SkinElement } from './types'
import { useSkinScale } from './useSkinScale'

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
