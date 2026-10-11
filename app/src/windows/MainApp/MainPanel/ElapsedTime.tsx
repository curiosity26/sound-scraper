import React, { type FC } from 'react'

import { formatElapsed } from '@/recorder/formatElapsed'
import type { SkinElement } from '@/skin/types'

import { ElementText } from './ElementText'
import { useTransport } from './useTransport'

export type ElapsedTimeProps = {
  readonly element: SkinElement
}

/**
 * The time display: the recording's elapsed time, or the playback position
 * (where the seek bar is being dragged to, while it is). Tenths unless the
 * element's style says `tenths: false`.
 */
export const ElapsedTime: FC<ElapsedTimeProps> = props => {
  const { element } = props
  const { elapsedMs } = useTransport()
  return (
    <ElementText
      testID="elapsed"
      element={element}
      text={formatElapsed(elapsedMs, element.style?.tenths !== false)}
    />
  )
}
