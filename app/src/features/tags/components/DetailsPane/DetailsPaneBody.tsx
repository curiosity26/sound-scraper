import { type FC, useEffect } from 'react'
import { ScrollView, StyleSheet } from 'react-native'

import { CoverArt } from './CoverArt'
import { DetailsFields } from './DetailsFields'
import type { DetailsPaneProps } from './DetailsPane'
import { DetailsPaneContext } from './DetailsPaneContext'
import { DetailsStatus } from './DetailsStatus'
import type { RecordingDetails } from './types'
import { useCoverSize } from './useCoverSize'
import { useRecordingDetails } from './useRecordingDetails'

export type DetailsPaneBodyProps = DetailsPaneProps & {
  /** The selection's tags and library entries (useDetailsRead). */
  readonly details: Promise<RecordingDetails>
  /** Reads them again, keeping what's shown. */
  readonly refresh: () => void
}

/**
 * The pane once the recording(s) are read (it suspends until then). The
 * recording(s) (useRecordingDetails) are shared with the parts through
 * DetailsPaneContext.
 */
export const DetailsPaneBody: FC<DetailsPaneBodyProps> = props => {
  const details = useRecordingDetails({
    fileNames: props.fileNames,
    details: props.details,
    refresh: props.refresh,
    onChanged: props.onChanged,
    onRenamed: props.onRenamed,
    onTrashed: props.onClose,
    showMenu: props.showMenu,
  })
  const cover = useCoverSize()

  // The title bar's menu button acts on what this pane shows, and on
  // nothing while another selection loads.
  const { menuRef } = props
  const { openMenu } = details
  useEffect(() => {
    if (!menuRef) {
      return undefined
    }
    menuRef.current = openMenu
    return () => {
      menuRef.current = undefined
    }
  })

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
