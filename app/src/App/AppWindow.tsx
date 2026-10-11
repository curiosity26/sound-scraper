import type { FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { LibraryScreen } from '@/components/LibraryScreen'

import { CoreVersion } from './CoreVersion'
import { RecordBar } from './RecordBar'
import { RecorderMessage } from './RecorderMessage'
import { useRecorderSession } from './RecorderSession'
import { SidePanel } from './SidePanel'
import { SourcePicker } from './SourcePicker'
import { TitleBar } from './TitleBar'
import { useAppearance } from './useAppearance'

/** The plain UI's window: recording controls above the library. */
export const AppWindow: FC = () => {
  const { isDark, textStyle, background } = useAppearance()
  const { setMessage } = useRecorderSession()
  return (
    <View style={[styles.root, background]}>
      <TitleBar />
      <CoreVersion />
      <SourcePicker />
      <RecordBar />
      <RecorderMessage />
      <LibraryScreen
        onMessage={setMessage}
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
