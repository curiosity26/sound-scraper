import { type FC, useCallback, useState } from 'react'

import { SkinPanelFrame } from '@/components/SkinPanelFrame'
import { Skinned } from '@/windows/Skinned'

import { LibraryContent } from './LibraryContent'

/** The library window. */
export const LibraryApp: FC = () => {
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
