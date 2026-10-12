import { type FC, useEffect, useRef } from 'react'

import { useSelection } from '@/features/library/hooks/useSelection'
import { selection } from '@/features/library/selection'
import { Skinned } from '@/features/skins/components/Skinned'
import { SkinPanelFrame } from '@/features/skins/components/SkinPanelFrame'
import { windows } from '@/features/skins/windows'

import { DetailsContent } from './DetailsContent'

/** The details window: the selected recording(s). Closing it deselects. */
export const DetailsWindow: FC = () => {
  const count = useSelection().fileNames.length
  const menuRef = useRef<(x: number, y: number) => void>(undefined)
  useEffect(() => {
    const subscription = windows.onEvent(e => {
      if (e.window === 'details' && e.event === 'hidden') {
        selection.set([])
      }
    })
    return () => {
      subscription.remove()
    }
  }, [])
  return (
    <Skinned>
      <SkinPanelFrame
        panel="details"
        title={count > 1 ? `Details (${String(count)})` : 'Details'}
        onMenu={count > 0 ? (x, y) => menuRef.current?.(x, y) : undefined}
      >
        <DetailsContent menuRef={menuRef} />
      </SkinPanelFrame>
    </Skinned>
  )
}
