import React, { type FC } from 'react'

import { TransportButton } from './TransportButton'

/** Record, play, pause and stop, those the layout has. */
export const TransportButtons: FC = () => (
  <>
    <TransportButton name="record" control="record" />
    <TransportButton name="play" control="play" />
    <TransportButton name="pause" control="pause" />
    <TransportButton name="stop" control="stop" />
  </>
)
