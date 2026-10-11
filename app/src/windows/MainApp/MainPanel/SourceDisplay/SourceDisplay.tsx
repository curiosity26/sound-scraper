import React, { type FC } from 'react'
import { Pressable } from 'react-native'

import { SpriteCell } from '@/components/SpriteCell'
import { useSkinScale } from '@/hooks/useSkinScale'
import type { ResolvedElement } from '@/native/bridge'
import { scaleRect } from '@/skin/scaleRect'
import { ElementText } from '@/windows/MainApp/MainPanel/ElementText'

import { useSourceDisplay } from './useSourceDisplay'

export type SourceDisplayProps = {
  readonly element: ResolvedElement
}

/**
 * The source element: its sprite, a button that chooses the capture source,
 * and its text (see useSourceDisplay).
 */
export const SourceDisplay: FC<SourceDisplayProps> = props => {
  const { element } = props
  const s = useSkinScale()
  const source = useSourceDisplay(element)
  return (
    <>
      <Pressable
        testID="source"
        accessibilityRole="button"
        accessibilityLabel={source.accessibilityLabel}
        onPress={() => {
          void source.choose()
        }}
        style={scaleRect(element.rect, s)}
      >
        {element.sprite && (
          <SpriteCell
            image={element.sprite.image}
            at={
              element.sprite.states.normal ??
              Object.values(element.sprite.states)[0]
            }
            size={[element.rect[2], element.rect[3]]}
          />
        )}
      </Pressable>
      <ElementText element={element} text={source.text} />
    </>
  )
}
