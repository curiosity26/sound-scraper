import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import type { ResolvedElement, ResolvedSprite } from '@/bridge/generated'
import { useSkinScale } from '@/features/skins/hooks/useSkinScale'
import { scaleRect } from '@/features/skins/scaleRect'

import { MeterCell } from './MeterCell'

export type SpriteBarProps = {
  readonly element: ResolvedElement
  /** The element's sprite: its "off" and "on" cells. */
  readonly sprite: ResolvedSprite
  /** 0..1 on the meter's scale: how much of "on" shows. */
  readonly level: number
}

/** The sprite bar meter: the "on" cell revealed over "off" up to the level. */
export const SpriteBar: FC<SpriteBarProps> = props => {
  const { element, sprite, level } = props
  const s = useSkinScale()
  const box = scaleRect(element.rect, s)
  const { width: w, height: h } = box
  const vertical = h > w
  const reveal = vertical ? Math.round(h * level) : Math.round(w * level)
  const cell = (state: string) => sprite.states[state]
  return (
    <View testID="levels" pointerEvents="none" style={[box, styles.clip]}>
      <MeterCell element={element} at={cell('off')} />
      <View
        style={[
          styles.reveal,
          { width: vertical ? w : reveal, height: vertical ? reveal : h },
        ]}
      >
        <View style={[styles.on, { width: w, height: h }]}>
          <MeterCell element={element} at={cell('on')} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  reveal: { position: 'absolute', overflow: 'hidden', left: 0, bottom: 0 },
  on: { position: 'absolute', left: 0, bottom: 0 },
})
