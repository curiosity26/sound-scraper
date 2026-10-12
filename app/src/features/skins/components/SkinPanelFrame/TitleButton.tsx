import React, { type FC } from 'react'
import { Pressable, StyleSheet } from 'react-native'

import type { ResolvedFramePanel } from '@/bridge/generated'
import { buttonState } from '@/features/skins/buttonState'
import { SpriteCell } from '@/features/skins/components/SpriteCell'
import type { Rect } from '@/features/skins/types'

export type TitleButtonProps = {
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
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={[
        styles.button,
        { left: rect[0], top: rect[1], width: rect[2], height: rect[3] },
      ]}
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

const styles = StyleSheet.create({
  button: { position: 'absolute' },
})
