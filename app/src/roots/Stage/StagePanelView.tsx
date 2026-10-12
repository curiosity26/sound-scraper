import { type FC, memo } from 'react'
import { StyleSheet, View } from 'react-native'

import { stage } from '@/features/skins/stage/stage'
import type { StagePanel } from '@/features/skins/stage/types'
import type { WindowName } from '@/features/skins/types'
import { BurnWindow } from '@/roots/BurnWindow'
import { DetailsWindow } from '@/roots/DetailsWindow'
import { EditorWindow } from '@/roots/EditorWindow'
import { LibraryWindow } from '@/roots/LibraryWindow'
import { MainWindow } from '@/roots/MainWindow'
import { SettingsWindow } from '@/roots/SettingsWindow'

const CONTENT: Record<WindowName, FC> = {
  main: MainWindow,
  library: LibraryWindow,
  settings: SettingsWindow,
  details: DetailsWindow,
  editor: EditorWindow,
  burn: BurnWindow,
}

/** What each panel is called (each is a window on macOS and Windows). */
const LABELS: Record<WindowName, string> = {
  main: 'Main panel',
  library: 'Library panel',
  settings: 'Settings panel',
  details: 'Details panel',
  editor: 'Editor panel',
  burn: 'Burn panel',
}

// The windows' roots, kept as they are while their frames change.
const Content = memo<{ readonly id: WindowName }>(props => {
  const Root = CONTENT[props.id]
  return <Root />
})
Content.displayName = 'StageContent'

export type StagePanelViewProps = {
  readonly panel: StagePanel
  readonly z: number
  /** False until the stage has placed it: then it's laid out at its own size, unseen. */
  readonly placed: boolean
}

/**
 * A panel on the stage at its frame. Hidden panels stay mounted (as the
 * other platforms hide their windows), so they keep their state.
 */
export const StagePanelView: FC<StagePanelViewProps> = props => {
  const { id, frame, visible } = props.panel
  return (
    <View
      accessibilityLabel={LABELS[id]}
      onTouchStart={() => {
        stage.raise(id)
      }}
      style={
        props.placed
          ? [
              styles.placed,
              {
                left: frame.x,
                top: frame.y,
                width: frame.w,
                height: frame.h,
                zIndex: props.z,
              },
              visible ? styles.shown : styles.hidden,
            ]
          : styles.measuring
      }
    >
      <Content id={id} />
    </View>
  )
}

const styles = StyleSheet.create({
  placed: { position: 'absolute' },
  shown: { display: 'flex' },
  hidden: { display: 'none' },
  measuring: { position: 'absolute', opacity: 0 },
})
