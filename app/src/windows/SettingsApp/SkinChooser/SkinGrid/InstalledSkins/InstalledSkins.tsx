import type { FC } from 'react'

import { TextLink } from '@/components/TextLink'
import { SkinCard } from '@/windows/SettingsApp/SkinChooser/SkinGrid/SkinCard'
import { useSkinChooser } from '@/windows/SettingsApp/SkinChooser/useSkinChooser'

import { useSkinList } from './useSkinList'

/** A card for each installed skin (suspends while they load). */
export const InstalledSkins: FC = () => {
  const { listRevision, isChosen, choose, remove } = useSkinChooser()
  const { list } = useSkinList(listRevision)
  return list.map(s => (
    <SkinCard
      key={s.id}
      testName={`skin-${s.id}`}
      name={s.name + (s.version ? ` ${s.version}` : '')}
      detail={s.author ?? (s.builtin ? 'Built in' : '')}
      preview={s.error ? null : s.builtin ? '' : s.id}
      chosen={isChosen(s)}
      error={s.error}
      onPress={
        s.error == null
          ? () => {
              void choose(s.builtin ? null : s.id)
            }
          : undefined
      }
    >
      {!s.builtin && (
        <TextLink
          label="Remove"
          onPress={() => {
            void remove(s)
          }}
        />
      )}
    </SkinCard>
  ))
}
