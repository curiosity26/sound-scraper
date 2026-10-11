// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { type FC } from 'react'
import { Pressable } from 'react-native'

import type { ResolvedFramePanel } from '@/bridge/generated'
import { buttonState } from '@/features/skins/buttonState'
import { SpriteCell } from '@/features/skins/components/SpriteCell'
import type { Rect } from '@/features/skins/types'

export type TitleButtonProps = {
  readonly testID: string
  readonly label: string
  readonly button: NonNullable<ResolvedFramePanel['close']>
  readonly rect: Rect
  readonly onPress: () => void
}

/** A sprite button in the title bar (close, menu). */
export const TitleButton: FC<TitleButtonProps> = props => {
  const { button, rect } = props
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={{
        position: 'absolute',
        left: rect[0],
        top: rect[1],
        width: rect[2],
        height: rect[3],
      }}
    >
      {({ pressed }) => (
        <SpriteCell
          image={button.sprite.image}
          at={
            button.sprite.states[
              buttonState(button.sprite.states, {
                pressed,
                active: false,
                disabled: false,
              })
            ]
          }
          size={button.size}
        />
      )}
    </Pressable>
  )
}
