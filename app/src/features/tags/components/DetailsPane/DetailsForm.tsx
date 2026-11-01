import type { FC } from 'react'
import { ScrollView, StyleSheet } from 'react-native'

import { CoverArt } from './CoverArt'
import { DetailsFields } from './DetailsFields'
import { DetailsPaneContext, type DetailsPaneState } from './DetailsPaneContext'
import { DetailsStatus } from './DetailsStatus'
import { useCoverSize } from './useCoverSize'

export type DetailsFormProps = {
  /**
   * What the form shows and edits: recordings on disk (DetailsPane), or
   * tracks in the editor's draft.
   */
  readonly state: DetailsPaneState
}

/**
 * The tag form: big cover art (click or drop an image to replace it), the
 * heading, the tags edited in place (Enter or leaving a field saves it, Esc
 * cancels), and file info. Several subjects: a bulk edit of their shared
 * tags, differing values shown as mixed.
 */
export const DetailsForm: FC<DetailsFormProps> = props => {
  const cover = useCoverSize()
  return (
    <DetailsPaneContext value={props.state}>
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
