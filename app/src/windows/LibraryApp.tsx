import { type FC, useCallback, useState } from 'react'
import { Text, View } from 'react-native'

import { openBurnPanel } from '@/burn/openBurnPanel'
import { LibraryScreen } from '@/library/LibraryScreen'
import type { Message } from '@/recorder/types'
import { SkinPanelFrame } from '@/skin/SkinPanelFrame'
import { windows } from '@/skin/windows'

import { Skinned } from './Skinned'
import { styles } from './styles'
import { usePanelText } from './usePanelText'

type LibraryContentProps = {
  readonly onCount: (n: number, playlistName?: string) => void
}

const LibraryContent: FC<LibraryContentProps> = props => {
  const { fg, isDark } = usePanelText('library')
  const [message, setMessage] = useState<Message>()
  return (
    <View style={styles.content}>
      <LibraryScreen
        onMessage={setMessage}
        textStyle={fg}
        isDark={isDark}
        compact
        onCount={props.onCount}
        openDetails={() => {
          windows.setPanelVisible('details', true)
        }}
        showLibraryMenu={(items, checked, x, y) =>
          windows.showMenu(items, checked, x, y, 'library')
        }
        onBurn={target => {
          openBurnPanel(target, () => {
            windows.setPanelVisible('burn', true)
          })
        }}
      />
      {message && (
        <Text
          selectable
          style={[styles.message, fg, message.isError && styles.error]}
        >
          {message.text}
        </Text>
      )}
    </View>
  )
}

/** The library window. */
export const LibraryApp: FC = () => {
  // A string, so an unchanged count doesn't re-render (and the callback is
  // stable: LibraryScreen reports again whenever it changes).
  const [title, setTitle] = useState('Library')
  const onCount = useCallback((n: number, playlist?: string) => {
    setTitle(`${playlist ? `Library: ${playlist}` : 'Library'} (${n})`)
  }, [])
  return (
    <Skinned>
      <SkinPanelFrame panel="library" title={title}>
        <LibraryContent onCount={onCount} />
      </SkinPanelFrame>
    </Skinned>
  )
}
