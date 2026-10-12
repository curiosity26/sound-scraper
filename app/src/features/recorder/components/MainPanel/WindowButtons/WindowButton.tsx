import React, { type FC } from 'react'

import { SkinButton } from '@/features/recorder/components/MainPanel/SkinButton'
import { useMainWindow } from '@/features/recorder/components/MainPanel/useMainWindow'
import type { ElementName } from '@/features/skins/types'

export type WindowButtonProps = {
  /** The layout's element, when it has one. */
  readonly name: ElementName
  readonly label: string
  readonly onPress: () => void
  /** Latched on (a panel open…). */
  readonly active?: boolean
}

/** A window button (side panels, minimize, shade), when the layout has it. */
export const WindowButton: FC<WindowButtonProps> = props => {
  const element = useMainWindow().layout.elements[props.name]
  if (!element) {
    return null
  }
  return (
    <SkinButton
      element={element}
      accessibilityLabel={props.label}
      onPress={props.onPress}
      active={props.active}
    />
  )
}
