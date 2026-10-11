import type { FC } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { useDetailsPane } from '@/components/DetailsPane/useDetailsPane'

import { ActionLinks } from './ActionLinks'
import { DetailsHeading } from './DetailsHeading'
import { FileInfo } from './FileInfo'
import { TagFields } from './TagFields'

/** Under the cover: the name and tags, file info and (without native
 * menus) the action links; a spinner while the tags load. */
export const DetailsFields: FC = () => {
  const { merged, error, linkActions } = useDetailsPane()
  if (!merged) {
    return error ? null : <ActivityIndicator />
  }
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
