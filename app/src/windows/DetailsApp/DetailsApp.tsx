import { type FC, useEffect, useRef } from 'react'

import { SkinPanelFrame } from '@/components/SkinPanelFrame'
import { useSelection } from '@/hooks/useSelection'
import { selection } from '@/library/selection'
import { windows } from '@/skin/windows'
import { Skinned } from '@/windows/Skinned'

import { DetailsContent } from './DetailsContent'

/** The details window: the selected recording(s). Closing it deselects. */
export const DetailsApp: FC = () => {
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
        title={count > 1 ? `Details (${count})` : 'Details'}
        onMenu={count > 0 ? (x, y) => menuRef.current?.(x, y) : undefined}
      >
        <DetailsContent menuRef={menuRef} />
      </SkinPanelFrame>
    </Skinned>
  )
}
