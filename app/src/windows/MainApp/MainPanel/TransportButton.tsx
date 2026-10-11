import React, { type FC } from 'react'

import type { ElementName, SkinElement } from '@/skin/types'

import { SkinButton } from './SkinButton'
import type { TransportControl } from './types'
import { useTransport } from './useTransport'

export type TransportButtonProps = {
  readonly element: SkinElement
  /** The element's name, its test ID. */
  readonly name: ElementName
  readonly control: TransportControl
}

/** A transport button (record, play…): its label, state and action. */
export const TransportButton: FC<TransportButtonProps> = props => {
  const spec = useTransport()[props.control]
  return (
    <SkinButton
      testID={props.name}
      element={props.element}
      accessibilityLabel={spec.label}
      onPress={spec.onPress}
      active={spec.active}
      disabled={spec.disabled}
      mode={spec.mode}
    />
  )
}
