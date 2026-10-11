// Layout here comes from skin data (rects, sizes), so styles are inline.
/* eslint-disable react-native/no-inline-styles */
import React, { type FC } from 'react'
import { View } from 'react-native'

import { DragSurface } from '@/components/DragSurface'
import { SkinImage } from '@/components/SkinImage'
import { useSkin } from '@/hooks/useSkin'
import { useSkinScale } from '@/hooks/useSkinScale'
import type { ElementName } from '@/skin/types'
import { windows } from '@/skin/windows'

import { ElapsedTime } from './ElapsedTime'
import { LevelMeter } from './LevelMeter'
import { SkinAnimation } from './SkinAnimation'
import { SkinButton } from './SkinButton'
import { SkinSeek } from './SkinSeek'
import { SourceDisplay } from './SourceDisplay'
import { StatusElement } from './StatusElement'
import { TransportButton } from './TransportButton'
import { TransportProvider } from './TransportProvider'
import type { ButtonSpec, TransportControl } from './types'
import { useMainWindow } from './useMainWindow'
import { Visualizer } from './Visualizer'

/**
 * The skinned main window: transport, time, status, levels and source.
 * The window's own chrome (shade, side panels, minimize) is handled here;
 * the transport's buttons and displays read it from TransportProvider.
 */
export const MainPanel: FC = () => {
  const skin = useSkin()
  const s = useSkinScale()
  const win = useMainWindow()
  const { layout } = win
  const els = layout.elements

  // A window button (side panels, minimize, shade).
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
  const transportButton = (name: ElementName, control: TransportControl) => {
    const el = els[name]
    return el ? (
      <TransportButton key={name} name={name} element={el} control={control} />
    ) : null
  }

  const [width, height] = layout.size

  return (
    <TransportProvider elements={els}>
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
          <SkinAnimation key={a.name ?? i} animation={a} />
        ))}
        {els.visualizer && <Visualizer element={els.visualizer} />}
        {els.levels && <LevelMeter element={els.levels} />}
        {els.elapsed && <ElapsedTime element={els.elapsed} />}
        {els.status && <StatusElement element={els.status} />}
        {els.source && <SourceDisplay element={els.source} />}
        {els.seek && <SkinSeek element={els.seek} />}
        {transportButton('record', 'record')}
        {transportButton('play', 'play')}
        {transportButton('pause', 'pause')}
        {transportButton('stop', 'stop')}
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
        {transportButton('close', 'quit')}
      </View>
    </TransportProvider>
  )
}
