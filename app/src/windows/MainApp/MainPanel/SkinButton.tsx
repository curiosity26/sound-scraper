// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { type FC } from 'react'
import { Pressable } from 'react-native'

import { SpriteCell } from '@/components/SpriteCell'
import { useSkinScale } from '@/hooks/useSkinScale'
import type { ResolvedElement } from '@/native/bridge'
import { buttonState } from '@/skin/buttonState'
import { scaleRect } from '@/skin/scaleRect'

export type SkinButtonProps = {
  readonly element: ResolvedElement
  readonly onPress: () => void
  /** Latched on (a panel open…). */
  readonly active?: boolean
  /**
   * A mode with its own look, e.g. "recording" for the record button: the
   * sprite's "recording"/"recordingPressed" states, falling back to
   * active/pressed.
   */
  readonly mode?: string
  readonly disabled?: boolean
  readonly testID?: string
  readonly accessibilityLabel: string
}

/**
 * A skin button: the element's sprite cell for its state (normal, pressed,
 * active, activePressed, disabled), or an invisible hot spot when the skin
 * paints the button into its background.
 */
export const SkinButton: FC<SkinButtonProps> = props => {
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
