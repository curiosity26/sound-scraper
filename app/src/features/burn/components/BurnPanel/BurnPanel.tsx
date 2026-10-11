// The burn panel (docs/playlists-and-cd-burning-design.md §6): choose where
// to burn a playlist, then watch it go track by track, ImgBurn style, with
// the phase, total and buffer bars, speed and a log.
import { type FC, useSyncExternalStore } from 'react'

import { burnJob } from '@/features/burn/burnJob'
import { burnTarget } from '@/features/burn/burnTarget'

import { NoPlaylist } from './NoPlaylist'
import { Progress } from './Progress'
import { Setup } from './Setup'

export const BurnPanel: FC = () => {
  const target = useSyncExternalStore(burnTarget.subscribe, burnTarget.get)
  const current = useSyncExternalStore(burnJob.subscribe, burnJob.get)

  if (current) {
    return <Progress key={current.id} current={current} />
  }
  if (!target) {
    return <NoPlaylist />
  }
  return <Setup key={target.playlistId} target={target} />
}
