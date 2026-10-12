import type { FC } from 'react'
import { StyleSheet, View } from 'react-native'

import { useDetailsPane } from '@/features/tags/components/DetailsPane/useDetailsPane'

import { ActionLinks } from './ActionLinks'
import { DetailsHeading } from './DetailsHeading'
import { FileInfo } from './FileInfo'
import { TagFields } from './TagFields'

/** Under the cover: the name and tags, file info and (without native
 * menus) the action links. */
export const DetailsFields: FC = () => {
  const { merged, linkActions } = useDetailsPane()
  return (
    <View style={styles.fields}>
      <DetailsHeading />
      <TagFields merged={merged} />
      <FileInfo />
      {linkActions && <ActionLinks />}
    </View>
  )
}

const styles = StyleSheet.create({
  fields: { marginTop: 10 },
})
