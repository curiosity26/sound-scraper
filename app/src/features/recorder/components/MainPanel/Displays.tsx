import React, { type FC } from 'react'

import { ElapsedTime } from './ElapsedTime'
import { LevelMeter } from './LevelMeter'
import { SkinSeek } from './SkinSeek'
import { SourceDisplay } from './SourceDisplay'
import { StatusElement } from './StatusElement'
import { useMainWindow } from './useMainWindow'
import { Visualizer } from './Visualizer'

/** The visualizer, levels, time, status, source and seek bar the layout has. */
export const Displays: FC = () => {
  const els = useMainWindow().layout.elements
  return (
    <>
      {els.visualizer && <Visualizer element={els.visualizer} />}
      {els.levels && <LevelMeter element={els.levels} />}
      {els.elapsed && <ElapsedTime element={els.elapsed} />}
      {els.status && <StatusElement element={els.status} />}
      {els.source && <SourceDisplay element={els.source} />}
      {els.seek && <SkinSeek element={els.seek} />}
    </>
  )
}
