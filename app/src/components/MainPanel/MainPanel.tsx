// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { type FC } from 'react'
import { Pressable, View } from 'react-native'

import { DragSurface } from '@/components/DragSurface'
import { SkinImage } from '@/components/SkinImage'
import { SpriteCell } from '@/components/SpriteCell'
import { useSkin } from '@/hooks/useSkin'
import { useSkinScale } from '@/hooks/useSkinScale'
import { formatElapsed } from '@/recorder/formatElapsed'
import { scaleRect } from '@/skin/scaleRect'
import type { ElementName } from '@/skin/types'
import { windows } from '@/skin/windows'

import { ElementText } from './ElementText'
import { LevelMeter } from './LevelMeter'
import { SkinAnimation } from './SkinAnimation'
import { SkinButton } from './SkinButton'
import { SkinSeek } from './SkinSeek'
import { StatusElement } from './StatusElement'
import type { ButtonSpec } from './types'
import { useMainWindow } from './useMainWindow'
import { useSourceDisplay } from './useSourceDisplay'
import { useTransport } from './useTransport'
import { Visualizer } from './Visualizer'

/** The skinned main window: transport, time, status, levels and source. */
export const MainPanel: FC = () => {
  const skin = useSkin()
  const s = useSkinScale()
  const win = useMainWindow()
  const { layout } = win
  const els = layout.elements
  const tape = useTransport(els)
  const source = useSourceDisplay(tape, els.source)
  const { levels } = tape

  const button = (name: ElementName, spec: ButtonSpec) => {
    const el = els[name]
    return el ? (
      <SkinButton
        key={name}
        testID={name}
        element={el}
        accessibilityLabel={spec.label}
        onPress={spec.onPress}
        active={spec.active}
        disabled={spec.disabled}
        mode={spec.mode}
      />
    ) : null
  }

  const [width, height] = layout.size

  return (
    <View
      testID={win.shaded ? 'shade-panel' : 'main-panel'}
      style={{
        width: width * s,
        height: height * s,
        backgroundColor: layout.background
          ? undefined
          : skin.colors.background ?? '#333333',
      }}
    >
      {layout.background && (
        <SkinImage
          image={layout.background}
          style={{ position: 'absolute', left: 0, top: 0 }}
        />
      )}
      <DragSurface
        panel="main"
        drag={win.dragRegions}
        onDoubleClick={win.toggleShade}
      />
      {layout.animations.map((a, i) => (
        <SkinAnimation
          key={a.name ?? i}
          animation={a}
          state={tape.tapeState}
          playing={tape.playing}
          level={levels.peak}
        />
      ))}
      {els.visualizer && (
        <Visualizer
          element={els.visualizer}
          presets={skin.visualizer.presets}
        />
      )}
      {els.levels && (
        <LevelMeter
          element={els.levels}
          peak={levels.peak}
          left={levels.left}
          right={levels.right}
          rmsLeft={levels.rmsLeft}
          rmsRight={levels.rmsRight}
        />
      )}
      {els.elapsed && (
        <ElementText
          testID="elapsed"
          element={els.elapsed}
          fonts={skin.fonts}
          text={formatElapsed(
            tape.elapsedMs,
            els.elapsed.style?.tenths !== false,
          )}
        />
      )}
      {els.status && (
        <StatusElement
          element={els.status}
          fonts={skin.fonts}
          state={tape.status.state}
          text={tape.status.text}
        />
      )}
      {els.source && (
        <Pressable
          testID="source"
          accessibilityRole="button"
          accessibilityLabel={source.accessibilityLabel}
          onPress={() => {
            void source.choose()
          }}
          style={scaleRect(els.source.rect, s)}
        >
          {els.source.sprite && (
            <SpriteCell
              image={els.source.sprite.image}
              at={
                els.source.sprite.states.normal ??
                Object.values(els.source.sprite.states)[0]
              }
              size={[els.source.rect[2], els.source.rect[3]]}
            />
          )}
        </Pressable>
      )}
      {els.source && (
        <ElementText
          element={els.source}
          fonts={skin.fonts}
          text={source.text}
        />
      )}
      {els.seek && <SkinSeek element={els.seek} {...tape.seek} />}
      {button('record', tape.record)}
      {button('play', tape.play)}
      {button('pause', tape.pause)}
      {button('stop', tape.stop)}
      {button('toggleLibrary', {
        label: 'Library',
        onPress: () => {
          win.togglePanel('library')
        },
        active: win.panels.library,
      })}
      {button('toggleSettings', {
        label: 'Settings',
        onPress: () => {
          win.togglePanel('settings')
        },
        active: win.panels.settings,
      })}
      {button('minimize', { label: 'Minimize', onPress: windows.minimize })}
      {button('shade', {
        label: win.shaded ? 'Expand' : 'Collapse',
        onPress: win.toggleShade,
        active: win.shaded,
      })}
      {button('close', tape.quit)}
    </View>
  )
}
