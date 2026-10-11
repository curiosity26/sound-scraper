import type { FC } from 'react'
import { Text, View } from 'react-native'

import { DetailsPane } from '@/components/DetailsPane'
import { usePanelText } from '@/hooks/usePanelText'
import { useSelection } from '@/hooks/useSelection'
import { refreshLibraryViews } from '@/library/refreshLibraryViews'
import { selection } from '@/library/selection'
import { playback } from '@/playback/playback'
import { windows } from '@/skin/windows'
import { styles } from '@/windows/styles'

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
    return (
      <View style={styles.content}>
        <Text style={[styles.message, fg]}>
          Click a recording in the library to see its details.
        </Text>
      </View>
    )
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
