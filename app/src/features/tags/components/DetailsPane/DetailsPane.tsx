import type { FC } from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'

import type { ShowMenu } from '@/features/library/types'
import { AsyncBoundary } from '@/shared/components/AsyncBoundary'

import { DetailsPaneBody } from './DetailsPaneBody'
import { useDetailsRead } from './useDetailsRead'

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
 * of their shared tags. A spinner while they're read, and Retry when that
 * fails (DetailsPaneBody shows the rest).
 */
export const DetailsPane: FC<DetailsPaneProps> = props => {
  const { key, details, refresh, retry } = useDetailsRead(props.fileNames)
  return (
    <AsyncBoundary
      what="read the tags"
      resetKeys={[key, details]}
      onReset={retry}
      fallback={
        <ActivityIndicator
          accessibilityLabel="Reading the tags"
          style={styles.loading}
        />
      }
    >
      {/* Keyed by the selection: its messages start afresh with each one. */}
      <DetailsPaneBody
        key={key}
        {...props}
        details={details}
        refresh={refresh}
      />
    </AsyncBoundary>
  )
}

const styles = StyleSheet.create({
  loading: { marginTop: 10 },
})
