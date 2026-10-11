import { type FC, useState } from 'react'
import { Text, View } from 'react-native'

import { openBurnPanel } from '@/features/burn/openBurnPanel'
import { LibraryScreen } from '@/features/library/components/LibraryScreen'
import type { Message } from '@/features/recorder/types'
import { usePanelText } from '@/features/skins/hooks/usePanelText'
import { windows } from '@/features/skins/windows'
import { styles } from '@/shared/theme/styles'

export type LibraryContentProps = {
  readonly onCount: (n: number, playlistName?: string) => void
}

/** The library panel and its status line. */
export const LibraryContent: FC<LibraryContentProps> = props => {
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
