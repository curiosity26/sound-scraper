import type { FC } from 'react'
import { View } from 'react-native'

import { useSelection } from '@/features/library/hooks/useSelection'
import { refreshLibraryViews } from '@/features/library/refreshLibraryViews'
import { selection } from '@/features/library/selection'
import { playback } from '@/features/playback/playback'
import { usePanelText } from '@/features/skins/hooks/usePanelText'
import { windows } from '@/features/skins/windows'
import { DetailsPane } from '@/features/tags/components/DetailsPane'
import { styles } from '@/shared/theme/styles'

import { NoSelection } from './NoSelection'

export type DetailsContentProps = {
  readonly menuRef: { current?: (x: number, y: number) => void }
}

/** The details window's content: the selected recording(s), or a hint. */
export const DetailsContent: FC<DetailsContentProps> = props => {
  const { fg, isDark } = usePanelText('details')
  const { fileNames } = useSelection()
  const close = () => {
    windows.setPanelVisible('details', false)
  }
  if (fileNames.length === 0) {
    return <NoSelection />
  }
  return (
    <View style={styles.content}>
      <DetailsPane
        fileNames={fileNames}
        onRenamed={(old, renamed) => {
          playback.renamed(old, renamed)
          selection.set([renamed])
        }}
        onChanged={refreshLibraryViews}
        onClose={close}
        showMenu={(items, x, y) => windows.showMenu(items, -1, x, y, 'details')}
        menuRef={props.menuRef}
        textStyle={fg}
        isDark={isDark}
      />
    </View>
  )
}
