import type { FC } from 'react'

import { Skinned } from '@/features/skins/components/Skinned'
import { SkinPanelFrame } from '@/features/skins/components/SkinPanelFrame'

import { SettingsContent } from './SettingsContent'

/** The settings window: settings, skin and about. */
export const SettingsWindow: FC = () => {
  return (
    <Skinned>
      <SkinPanelFrame panel="settings" title="Settings">
        <SettingsContent />
      </SkinPanelFrame>
    </Skinned>
  )
}
