import type { FC } from 'react'

import { baseName } from '@/features/skins/components/SkinChooser/baseName'
import { useSkinChooser } from '@/features/skins/components/SkinChooser/useSkinChooser'
import { skinStore } from '@/features/skins/skinStore'
import { TextLink } from '@/shared/components/TextLink'

import { SkinCard } from './SkinCard'

export type FolderSkinCardProps = {
  /** The skin folder in use. */
  readonly folder: string
}

/** The skin folder in use (a skin being made), with Package and Stop. */
export const FolderSkinCard: FC<FolderSkinCardProps> = props => {
  const { folder } = props
  const { packageFolder, choose } = useSkinChooser()
  return (
    <SkinCard
      name={skinStore.get()?.name ?? baseName(folder)}
      detail={`Live from ${baseName(folder)}`}
      preview={folder}
      chosen
    >
      <TextLink
        label="Package skin…"
        onPress={() => {
          packageFolder(folder)
        }}
      />
      <TextLink
        label="Stop"
        onPress={() => {
          choose(null)
        }}
      />
    </SkinCard>
  )
}
