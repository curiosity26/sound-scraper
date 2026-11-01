import type { FC } from 'react'

import type { ShowMenu } from '@/features/library/types'

import { DetailsForm } from './DetailsForm'
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
 * Details of the selected recording(s) in the tag form (DetailsForm): the
 * file name and tags edited in place, the cover, file info, and a gear menu
 * with Show in Finder, cover and trash actions. Several recordings: a bulk
 * edit of their shared tags.
 */
export const DetailsPane: FC<DetailsPaneProps> = props => {
  const details = useRecordingDetails({
    fileNames: props.fileNames,
    onChanged: props.onChanged,
    onRenamed: props.onRenamed,
    onTrashed: props.onClose,
    showMenu: props.showMenu,
  })

  if (props.menuRef) {
    props.menuRef.current = details.openMenu
  }

  return (
    <DetailsForm
      state={{
        ...details,
        fileNames: props.fileNames,
        onClose: props.onClose,
        linkActions: !props.showMenu,
        textStyle: props.textStyle,
        isDark: props.isDark,
      }}
    />
  )
}
