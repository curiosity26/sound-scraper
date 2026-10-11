import React, { type FC } from 'react'

import type { ElementName } from '@/features/skins/types'

import { SkinButton } from './SkinButton'
import type { TransportControl } from './types'
import { useMainWindow } from './useMainWindow'
import { useTransport } from './useTransport'

export type TransportButtonProps = {
  /** The layout's element (when it has one), and its test ID. */
  readonly name: ElementName
  readonly control: TransportControl
}

/** A transport button (record, play…): its label, state and action. */
export const TransportButton: FC<TransportButtonProps> = props => {
  const spec = useTransport()[props.control]
  const element = useMainWindow().layout.elements[props.name]
  if (!element) {
    return null
  }
  return (
    <SkinButton
      testID={props.name}
      element={element}
      accessibilityLabel={spec.label}
      onPress={spec.onPress}
      active={spec.active}
      disabled={spec.disabled}
      mode={spec.mode}
    />
  )
}
