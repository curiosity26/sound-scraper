import type { FC } from 'react'

import { TextLink } from '@/components/TextLink'
import { skinStore } from '@/skin/skinStore'
import { baseName } from '@/windows/SettingsApp/SkinChooser/baseName'
import { useSkinChooser } from '@/windows/SettingsApp/SkinChooser/useSkinChooser'

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
          void packageFolder(folder)
        }}
      />
      <TextLink
        label="Stop"
        onPress={() => {
          void choose(null)
        }}
      />
    </SkinCard>
  )
}
