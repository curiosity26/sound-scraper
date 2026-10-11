// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { type FC } from 'react'
import { Text, View } from 'react-native'

import { SpriteText } from '@/components/SpriteText'
import { useSkinScale } from '@/hooks/useSkinScale'
import { scaleRect } from '@/skin/scaleRect'
import type { SkinElement, SpriteFont } from '@/skin/types'

export type ElementTextProps = {
  readonly element: SkinElement
  readonly fonts: Record<string, SpriteFont>
  readonly text: string
  readonly testID?: string
}

/**
 * An element's text: its sprite font if it has one, else system text in
 * the element's text style. Positioned at the element's rect.
 */
export const ElementText: FC<ElementTextProps> = props => {
  const { element, fonts } = props
  const s = useSkinScale()
  const [, , w, h] = element.rect
  const font = element.font ? fonts[element.font] : undefined
  const pad = element.style?.pad === true
  const align = element.align ?? 'left'
  const t = element.text
  return (
    <View
      testID={props.testID}
      pointerEvents="none"
      style={[scaleRect(element.rect, s), { justifyContent: 'center' }]}
    >
      {font ? (
        <SpriteText
          font={font}
          text={props.text}
          width={w * s}
          align={align}
          pad={pad}
          flip={element.style?.flip === true}
        />
      ) : (
        <Text
          numberOfLines={1}
          style={{
            color: t?.color ?? '#ffffff',
            fontSize: (t?.size ?? Math.max(8, h * 0.7)) * s,
            fontFamily: t?.family ?? undefined,
            fontWeight: t?.weight === 'bold' ? '700' : '400',
            textAlign: align,
            fontVariant: ['tabular-nums'],
          }}
        >
          {t?.uppercase ? props.text.toUpperCase() : props.text}
        </Text>
      )}
    </View>
  )
}
