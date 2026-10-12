import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { DragSurface } from '@/features/skins/components/DragSurface'
import { SkinImage } from '@/features/skins/components/SkinImage'
import { useSkin } from '@/features/skins/hooks/useSkin'
import { useSkinScale } from '@/features/skins/hooks/useSkinScale'

import { Displays } from './Displays'
import { MainWindowContext } from './MainWindowContext'
import { SkinAnimation } from './SkinAnimation'
import { TransportButtons } from './TransportButtons'
import { TransportProvider } from './TransportProvider'
import { useMainWindowState } from './useMainWindowState'
import { VisualizerPresetProvider } from './VisualizerPresetProvider'
import { WindowButtons } from './WindowButtons'

/**
 * The skinned main window: transport, time, status, levels and source.
 * The window's own chrome (shade, side panels, minimize) is handled here
 * and shared with its parts through MainWindowContext; the transport's
 * buttons and displays read it from TransportProvider. Both providers stay
 * mounted while the window shades, so nothing resets.
 */
export const MainPanel: FC = () => {
  const skin = useSkin()
  const s = useSkinScale()
  const win = useMainWindowState()
  const { layout } = win
  const [width, height] = layout.size

  return (
    <MainWindowContext value={win}>
      <TransportProvider elements={layout.elements}>
        <VisualizerPresetProvider>
          <View
            style={{
              width: width * s,
              height: height * s,
              backgroundColor: layout.background
                ? undefined
                : skin.colors.background ?? '#333333',
            }}
          >
            {layout.background && (
              <SkinImage image={layout.background} style={styles.background} />
            )}
            <DragSurface
              panel="main"
              drag={win.dragRegions}
              onDoubleClick={win.toggleShade}
            />
            {layout.animations.map((a, i) => (
              <SkinAnimation key={a.name ?? i} animation={a} />
            ))}
            <Displays />
            <TransportButtons />
            <WindowButtons />
          </View>
        </VisualizerPresetProvider>
      </TransportProvider>
    </MainWindowContext>
  )
}

const styles = StyleSheet.create({
  background: { position: 'absolute', left: 0, top: 0 },
})
