// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { type FC } from 'react'
import { Text, View } from 'react-native'

import { DragSurface } from '@/components/DragSurface'
import { NineSlice } from '@/components/NineSlice'
import { SpriteText } from '@/components/SpriteText'
import { useSkin } from '@/hooks/useSkin'
import { useSkinScale } from '@/hooks/useSkinScale'
import type { PanelName } from '@/skin/types'
import { windows } from '@/skin/windows'
import { PanelThemeProvider } from '@/theme/PanelThemeProvider'

import { Grip } from './Grip'
import { themeFromPanel } from './themeFromPanel'
import { TitleButton } from './TitleButton'
import { usePanelChrome } from './usePanelChrome'

export type SkinPanelFrameProps = {
  readonly panel: PanelName
  readonly title: string
  readonly children: React.ReactNode
  /** The title bar's menu button (when the skin has one) was clicked; (x, y)
   * is the point under it, in the window. */
  readonly onMenu?: (x: number, y: number) => void
}

/**
 * A library/settings window drawn by the skin: the nine-slice frame, the
 * title, a close button and (resizable panels) a grip; the content goes
 * inside the frame's insets, with the panel's colors.
 */
export const SkinPanelFrame: FC<SkinPanelFrameProps> = props => {
  const skin = useSkin()
  const s = useSkinScale()
  const def = skin.panels[props.panel]
  const chrome = usePanelChrome(props.panel, props.onMenu !== undefined)
  const { width: w, height: h, closeRect, menuRect, grip } = chrome
  const { top, right, bottom, left } = chrome.insets
  const close = def.close
  const menu = props.onMenu ? def.menu : null
  const hide = () => {
    windows.setPanelVisible(props.panel, false)
  }
  const titleFont = def.title?.font ? skin.fonts[def.title.font] : undefined
  const titleOffset = def.title?.offset ?? [12, 6]
  const theme = { ...themeFromPanel(def), compact: s === 1 }

  return (
    <View
      testID={`${props.panel}-frame`}
      style={{
        flex: 1,
        backgroundColor: def.frame ? undefined : theme.background,
      }}
      onLayout={chrome.onLayout}
    >
      {def.frame && w > 0 && (
        <NineSlice
          image={def.frame.image}
          slice={def.frame.slice}
          width={w}
          height={h}
          style={{ position: 'absolute', left: 0, top: 0 }}
        />
      )}
      {w > 0 && <DragSurface panel={props.panel} drag={[[0, 0, w, top]]} />}
      {w > 0 && (
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
                color: def.title?.color ?? theme.text,
                fontSize: 11 * s,
              }}
            >
              {props.title}
            </Text>
          )}
        </View>
      )}
      {close && closeRect && (
        <TitleButton
          testID={`${props.panel}-close`}
          label={`Close ${props.title}`}
          button={close}
          rect={closeRect}
          onPress={hide}
        />
      )}
      {menu && menuRect && props.onMenu && (
        <TitleButton
          testID={`${props.panel}-menu`}
          label={`${props.title} actions`}
          button={menu}
          rect={menuRect}
          onPress={() => props.onMenu?.(menuRect[0], menuRect[1] + menuRect[3])}
        />
      )}
      <PanelThemeProvider value={theme}>
        <View
          style={{
            position: 'absolute',
            left,
            top,
            right,
            bottom,
            backgroundColor: theme.background,
            overflow: 'hidden',
          }}
        >
          {props.children}
        </View>
      </PanelThemeProvider>
      {grip && <Grip rect={grip} color={theme.accent ?? '#888888'} />}
      {grip && <DragSurface panel={props.panel} drag={[]} grip={grip} />}
    </View>
  )
}
