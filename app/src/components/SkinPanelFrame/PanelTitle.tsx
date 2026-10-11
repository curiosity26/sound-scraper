// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { type FC } from 'react'
import { Text, View } from 'react-native'

import { SpriteText } from '@/components/SpriteText'
import { useSkin } from '@/hooks/useSkin'
import { useSkinScale } from '@/hooks/useSkinScale'
import type { PanelName } from '@/skin/types'

import { themeFromPanel } from './themeFromPanel'

export type PanelTitleProps = {
  readonly panel: PanelName
  readonly title: string
}

/** The title in the frame's title bar: the skin's sprite font, or text. */
export const PanelTitle: FC<PanelTitleProps> = props => {
  const skin = useSkin()
  const s = useSkinScale()
  const def = skin.panels[props.panel]
  const titleFont = def.title?.font ? skin.fonts[def.title.font] : undefined
  const titleOffset = def.title?.offset ?? [12, 6]
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: titleOffset[0] * s,
        top: titleOffset[1] * s,
        paddingHorizontal: 3 * s,
        backgroundColor: def.title?.background ?? skin.colors.panel,
      }}
    >
      {titleFont ? (
        <SpriteText
          font={titleFont}
          text={props.title.toUpperCase()}
          width={titleFont.cell[0] * s * props.title.length}
          marquee={false}
        />
      ) : (
        <Text
          style={{
            color: def.title?.color ?? themeFromPanel(def).text,
            fontSize: 11 * s,
          }}
        >
          {props.title}
        </Text>
      )}
    </View>
  )
}
