import type { FC } from 'react'
import { View } from 'react-native'

import { AsyncBoundary } from '@/components/AsyncBoundary'
import { styles } from '@/windows/SettingsApp/SkinChooser/styles'
import { useSkinChooser } from '@/windows/SettingsApp/SkinChooser/useSkinChooser'

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
