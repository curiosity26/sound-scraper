import type { FC } from 'react'
import { ScrollView, StyleSheet } from 'react-native'

import type { ShowMenu } from '@/features/library/types'

import { CoverArt } from './CoverArt'
import { DetailsFields } from './DetailsFields'
import { DetailsPaneContext } from './DetailsPaneContext'
import { DetailsStatus } from './DetailsStatus'
import { useCoverSize } from './useCoverSize'
import { useRecordingDetails } from './useRecordingDetails'

export type DetailsPaneProps = {
  /** One recording, or several for a bulk edit. */
  readonly fileNames: readonly string[]
  /** A rename gave the recording a new file name. */
  readonly onRenamed: (oldName: string, newName: string) => void
  /** Something changed on disk (tags, name, trash). */
  readonly onChanged: () => void
  readonly onClose: () => void
  /** The actions menu; without it (no native menus) they show as links. */
  readonly showMenu?: ShowMenu
  /** Set to a function that opens the actions menu at (x, y) in the window
   * (the panel's title-bar menu button calls it). */
  readonly menuRef?: { current?: (x: number, y: number) => void }
  readonly textStyle: object
  readonly isDark: boolean
}

/**
 * Details of the selected recording(s): big cover art (click or drop an
 * image to replace it), the file name and tags edited in place (Enter or
 * leaving a field saves it, Esc cancels), file info, and a gear menu with
 * Show in Finder, cover and trash actions. Several recordings: a bulk edit
 * of their shared tags. The recording(s) (useRecordingDetails) are shared
 * with the parts through DetailsPaneContext.
 */
export const DetailsPane: FC<DetailsPaneProps> = props => {
  const details = useRecordingDetails({
    fileNames: props.fileNames,
    onChanged: props.onChanged,
    onRenamed: props.onRenamed,
    onTrashed: props.onClose,
    showMenu: props.showMenu,
  })
  const cover = useCoverSize()

  if (props.menuRef) {
    props.menuRef.current = details.openMenu
  }

  return (
    <DetailsPaneContext
      value={{
        ...details,
        fileNames: props.fileNames,
        onClose: props.onClose,
        linkActions: !props.showMenu,
        textStyle: props.textStyle,
        isDark: props.isDark,
      }}
    >
      <ScrollView style={styles.root} onLayout={cover.onLayout}>
        <CoverArt size={cover.size} />
        <DetailsStatus />
        <DetailsFields />
      </ScrollView>
    </DetailsPaneContext>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
