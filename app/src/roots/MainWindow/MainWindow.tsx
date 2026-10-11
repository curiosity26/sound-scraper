import type { FC } from 'react'

import { MainPanel } from '@/features/recorder/components/MainPanel'
import { Skinned } from '@/features/skins/components/Skinned'

import { useFolderLiveReload } from './useFolderLiveReload'
import { useMainMenuCommands } from './useMainMenuCommands'

/** The main window: the skinned panel. */
export const MainWindow: FC = () => {
  useMainMenuCommands()
  useFolderLiveReload()
  return (
    <Skinned>
      <MainPanel />
    </Skinned>
  )
}
