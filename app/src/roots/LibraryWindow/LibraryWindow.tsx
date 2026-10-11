import { type FC, useCallback, useState } from 'react'

import { Skinned } from '@/features/skins/components/Skinned'
import { SkinPanelFrame } from '@/features/skins/components/SkinPanelFrame'

import { LibraryContent } from './LibraryContent'

/** The library window. */
export const LibraryWindow: FC = () => {
  // A string, so an unchanged count doesn't re-render (and the callback is
  // stable: LibraryScreen reports again whenever it changes).
  const [title, setTitle] = useState('Library')
  const onCount = useCallback((n: number, playlist?: string) => {
    setTitle(`${playlist ? `Library: ${playlist}` : 'Library'} (${n})`)
  }, [])
  return (
    <Skinned>
      <SkinPanelFrame panel="library" title={title}>
        <LibraryContent onCount={onCount} />
      </SkinPanelFrame>
    </Skinned>
  )
}
