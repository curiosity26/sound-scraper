import React, { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'

import { DetailsPane } from '@/library/DetailsPane'
import { refreshLibraryViews } from '@/library/refreshLibraryViews'
import { selection } from '@/library/selection'
import { playback } from '@/playback/playback'
import { SkinPanelFrame } from '@/skin/SkinPanelFrame'
import { windows } from '@/skin/windows'

import { Skinned } from './Skinned'
import { styles } from './styles'
import { usePanelText } from './usePanelText'

function DetailsContent(props: {
  menuRef: { current?: (x: number, y: number) => void }
}) {
  const { fg, isDark } = usePanelText('details')
  const [fileNames, setFileNames] = useState(selection.get())
  useEffect(() => selection.subscribe(setFileNames), [])
  const close = () => windows.setPanelVisible('details', false)
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

/** The details window: the selected recording(s). Closing it deselects. */
export function DetailsApp(): React.JSX.Element {
  const [count, setCount] = useState(selection.get().length)
  const menuRef = useRef<(x: number, y: number) => void>(undefined)
  useEffect(() => {
    const unsubscribe = selection.subscribe(names => setCount(names.length))
    const subscription = windows.onEvent(e => {
      if (e.window === 'details' && e.event === 'hidden') {
        selection.set([])
      }
    })
    return () => {
      unsubscribe()
      subscription.remove()
    }
  }, [])
  return (
    <Skinned>
      <SkinPanelFrame
        panel="details"
        title={count > 1 ? `Details (${count})` : 'Details'}
        onMenu={count > 0 ? (x, y) => menuRef.current?.(x, y) : undefined}
      >
        <DetailsContent menuRef={menuRef} />
      </SkinPanelFrame>
    </Skinned>
  )
}
