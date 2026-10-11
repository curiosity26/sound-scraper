import type { FC } from 'react'

import { MainPanel } from '@/components/MainPanel'
import { Skinned } from '@/windows/Skinned'

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
