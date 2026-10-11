import type { FC } from 'react'
import { View } from 'react-native'

import { styles } from '@/features/skins/components/SkinChooser/styles'
import { useSkinChooser } from '@/features/skins/components/SkinChooser/useSkinChooser'
import { AsyncBoundary } from '@/shared/components/AsyncBoundary'

import { FolderSkinCard } from './FolderSkinCard'
import { InstalledSkins } from './InstalledSkins'

/** The skin folder in use (if any), then the installed skins. */
export const SkinGrid: FC = () => {
  const { folderInUse, listRevision } = useSkinChooser()
  return (
    <View style={styles.grid}>
      {folderInUse && <FolderSkinCard folder={folderInUse} />}
      <AsyncBoundary what="list the skins" resetKeys={[listRevision]}>
        <InstalledSkins />
      </AsyncBoundary>
    </View>
  )
}
