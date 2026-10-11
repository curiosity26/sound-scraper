import React, { type FC } from 'react'
import { View } from 'react-native'

import type { ResolvedElement } from '@/bridge/generated'
import { SpriteCell } from '@/features/skins/components/SpriteCell'
import { useSkinScale } from '@/features/skins/hooks/useSkinScale'
import { scaleRect } from '@/features/skins/scaleRect'

import { ElementText } from './ElementText'
import { useTransport } from './useTransport'

export type StatusElementProps = {
  readonly element: ResolvedElement
}

/**
 * The transport's status: the status sprite for the state (a recorder
 * state, or a player state during playback) when the skin has one, else
 * its text.
 */
export const StatusElement: FC<StatusElementProps> = props => {
  const { element } = props
  const s = useSkinScale()
  const { status } = useTransport()
  const sprite = element.sprite
  if (sprite) {
    const at = sprite.states[status.state] ?? sprite.states.idle
    return (
      <View
        testID="status"
        accessible
        accessibilityLabel={status.text}
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
  return <ElementText testID="status" element={element} text={status.text} />
}
