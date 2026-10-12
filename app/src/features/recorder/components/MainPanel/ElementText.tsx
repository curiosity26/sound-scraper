import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import type { ResolvedElement } from '@/bridge/generated'
import { SpriteText } from '@/features/skins/components/SpriteText'
import { useSkin } from '@/features/skins/hooks/useSkin'
import { useSkinScale } from '@/features/skins/hooks/useSkinScale'
import { scaleRect } from '@/features/skins/scaleRect'

export type ElementTextProps = {
  readonly element: ResolvedElement
  readonly text: string
}

/**
 * An element's text: its sprite font (from the skin) if it has one, else
 * system text in the element's text style. Positioned at the element's rect.
 */
export const ElementText: FC<ElementTextProps> = props => {
  const { element } = props
  const { fonts } = useSkin()
  const s = useSkinScale()
  const [, , w, h] = element.rect
  const font = element.font ? fonts[element.font] : undefined
  const pad = element.style?.pad === true
  const align = element.align ?? 'left'
  const t = element.text
  return (
    <View pointerEvents="none" style={[scaleRect(element.rect, s), styles.box]}>
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
          style={[
            styles.text,
            t?.weight === 'bold' && styles.bold,
            {
              color: t?.color ?? '#ffffff',
              fontSize: (t?.size ?? Math.max(8, h * 0.7)) * s,
              fontFamily: t?.family ?? undefined,
              textAlign: align,
            },
          ]}
        >
          {t?.uppercase ? props.text.toUpperCase() : props.text}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { justifyContent: 'center' },
  text: { fontWeight: '400', fontVariant: ['tabular-nums'] },
  bold: { fontWeight: '700' },
})
