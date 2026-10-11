import React, { type FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { useLibraryScreen } from '@/features/library/components/LibraryScreen/useLibraryScreen'
import { useSelection } from '@/features/library/hooks/useSelection'
import { refreshLibraryViews } from '@/features/library/refreshLibraryViews'
import { selection } from '@/features/library/selection'
import { playback } from '@/features/playback/playback'
import { DetailsPane } from '@/features/tags/components/DetailsPane'

/**
 * The details pane beside the table, for the selection; none when the
 * screen shows details in a separate window (`openDetails`).
 */
export const SideDetails: FC = () => {
  const { openDetails, showMenu, textStyle, isDark } = useLibraryScreen()
  const selected = useSelection().fileNames
  if (openDetails || selected.length === 0) {
    return null
  }
  return (
    <View style={styles.pane}>
      <DetailsPane
        fileNames={selected}
        onRenamed={(old, renamed) => {
          playback.renamed(old, renamed)
          selection.set([renamed])
        }}
        onChanged={refreshLibraryViews}
        onClose={() => {
          selection.set([])
        }}
        showMenu={showMenu}
        textStyle={textStyle}
        isDark={isDark}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  pane: { width: 300, marginLeft: 16 },
})
