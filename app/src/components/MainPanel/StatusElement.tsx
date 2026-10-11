import React, { type FC } from 'react'
import { View } from 'react-native'

import { SpriteCell } from '@/components/SpriteCell'
import { useSkinScale } from '@/hooks/useSkinScale'
import { scaleRect } from '@/skin/scaleRect'
import type { SkinElement, SpriteFont } from '@/skin/types'

import { ElementText } from './ElementText'

export type StatusElementProps = {
  readonly element: SkinElement
  readonly fonts: Record<string, SpriteFont>
  /** A recorder state, or a player state during playback. */
  readonly state: string
  readonly text: string
}

/** The status sprite for the state when the skin has one, else its text. */
export const StatusElement: FC<StatusElementProps> = props => {
  const { element } = props
  const s = useSkinScale()
  const sprite = element.sprite
  if (sprite) {
    const at = sprite.states[props.state] ?? sprite.states.idle
    return (
      <View
        testID="status"
        accessible
        accessibilityLabel={props.text}
        style={scaleRect(element.rect, s)}
      >
        <SpriteCell
          image={sprite.image}
          at={at}
          size={[element.rect[2], element.rect[3]]}
        />
      </View>
    )
  }
  return (
    <ElementText
      testID="status"
      element={element}
      fonts={props.fonts}
      text={props.text}
    />
  )
}
