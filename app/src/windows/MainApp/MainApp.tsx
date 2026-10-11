import type { FC } from 'react'

import { Skinned } from '@/windows/Skinned'

import { MainPanel } from './MainPanel'
import { useFolderLiveReload } from './useFolderLiveReload'
import { useMainMenuCommands } from './useMainMenuCommands'

/** The main window: the skinned panel. */
export const MainApp: FC = () => {
  useMainMenuCommands()
  useFolderLiveReload()
  return (
    <Skinned>
      <MainPanel />
    </Skinned>
  )
}
