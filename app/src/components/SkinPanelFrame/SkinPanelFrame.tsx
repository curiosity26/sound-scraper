// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { type FC, useEffect, useState } from 'react'
import { type LayoutChangeEvent, Pressable, Text, View } from 'react-native'

import { DragSurface } from '@/components/DragSurface'
import { NineSlice } from '@/components/NineSlice'
import { SpriteCell } from '@/components/SpriteCell'
import { SpriteText } from '@/components/SpriteText'
import { useSkin } from '@/hooks/useSkin'
import { useSkinScale } from '@/hooks/useSkinScale'
import { buttonState } from '@/skin/buttonState'
import type { FramePanel, PanelName, Rect } from '@/skin/types'
import { windows } from '@/skin/windows'
import { PanelThemeProvider } from '@/theme/PanelThemeProvider'
import { themeFromPanel } from '@/theme/themeFromPanel'

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
  const [size, setSize] = useState<[number, number]>([0, 0])
  const [w, h] = size
  const slice = def.frame?.slice ?? [24, 6, 6, 6]
  const top = slice[0] * s
  const right = slice[1] * s
  const bottom = slice[2] * s
  const left = slice[3] * s
  const close = def.close
  const closeRect: Rect | null = close
    ? [
        w - (close.offset[0] + close.size[0]) * s,
        close.offset[1] * s,
        close.size[0] * s,
        close.size[1] * s,
      ]
    : null
  const menu = props.onMenu ? def.menu : null
  const menuRect: Rect | null = menu
    ? [
        w - (menu.offset[0] + menu.size[0]) * s,
        menu.offset[1] * s,
        menu.size[0] * s,
        menu.size[1] * s,
      ]
    : null
  const grip: Rect | null = def.resizable
    ? [
        w - def.grip[0] * s,
        h - def.grip[1] * s,
        def.grip[0] * s,
        def.grip[1] * s,
      ]
    : null

  useEffect(() => {
    if (w === 0) {
      return
    }
    // Double size enlarges the frame, not the content, so the minimum only
    // grows by the frame's extra size (letting panels shrink to fit a
    // crowded screen).
    const min = def.minSize ?? [320, 200]
    const extra: [number, number] = [
      (left + right) * (1 - 1 / s),
      (top + bottom) * (1 - 1 / s),
    ]
    windows.setPanelChrome(props.panel, {
      drag: [[0, 0, w, top]],
      holes: [closeRect, menuRect].filter((r): r is Rect => r !== null),
      grip,
      minSize: [min[0] + extra[0], min[1] + extra[1]],
      scale: s,
    })
    // closeRect/menuRect/grip derive from these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.panel, w, h, top, s, def])

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize([width, height])
  }
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
      onLayout={onLayout}
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
      {grip && <Grip rect={grip} color={theme.accent ?? '#888888'} scale={s} />}
      {grip && <DragSurface panel={props.panel} drag={[]} grip={grip} />}
    </View>
  )
}

type GripProps = {
  readonly rect: Rect
  readonly color: string
  readonly scale: number
}

/** A staircase of dots in the resize corner. */
const Grip: FC<GripProps> = props => {
  const [x, y, w, h] = props.rect
  const s = props.scale
  const dots = []
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (row + col >= 2) {
        dots.push(
          <View
            key={`${row}-${col}`}
            style={{
              position: 'absolute',
              left: w - (3 - col) * 3 * s - s,
              top: h - (3 - row) * 3 * s - s,
              width: 2 * s,
              height: 2 * s,
              backgroundColor: props.color,
            }}
          />,
        )
      }
    }
  }
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: x, top: y, width: w, height: h }}
    >
      {dots}
    </View>
  )
}

type TitleButtonProps = {
  readonly testID: string
  readonly label: string
  readonly button: NonNullable<FramePanel['close']>
  readonly rect: Rect
  readonly onPress: () => void
}

/** A sprite button in the title bar (close, menu). */
const TitleButton: FC<TitleButtonProps> = props => {
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
