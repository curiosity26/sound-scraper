import type { FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { LibraryScreen } from '@/components/LibraryScreen'

import { CoreVersion } from './CoreVersion'
import { RecordBar } from './RecordBar'
import { RecorderMessage } from './RecorderMessage'
import { recorderSession } from './recorderSession'
import { SidePanel } from './SidePanel'
import { SourcePicker } from './SourcePicker'
import { TitleBar } from './TitleBar'
import { useAppearance } from './useAppearance'

/** The plain (unskinned) UI, used when skins aren't available. */
export const App: FC = () => {
  const { isDark, textStyle, background } = useAppearance()
  return (
    <View style={[styles.root, background]}>
      <TitleBar />
      <CoreVersion />
      <SourcePicker />
      <RecordBar />
      <RecorderMessage />
      <LibraryScreen
        onMessage={recorderSession.setMessage}
        textStyle={textStyle}
        isDark={isDark}
      />
      <SidePanel />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24 },
})
