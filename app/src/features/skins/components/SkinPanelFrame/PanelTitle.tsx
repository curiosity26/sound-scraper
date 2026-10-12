import React, { type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { SpriteText } from '@/features/skins/components/SpriteText'
import { useSkin } from '@/features/skins/hooks/useSkin'
import { useSkinScale } from '@/features/skins/hooks/useSkinScale'
import type { PanelName } from '@/features/skins/types'

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
      style={[
        styles.title,
        {
          left: titleOffset[0] * s,
          top: titleOffset[1] * s,
          paddingHorizontal: 3 * s,
          backgroundColor: def.title?.background ?? skin.colors.panel,
        },
      ]}
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

const styles = StyleSheet.create({
  title: { position: 'absolute' },
})
