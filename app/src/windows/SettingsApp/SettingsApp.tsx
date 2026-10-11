import type { FC } from 'react'

import { SkinPanelFrame } from '@/components/SkinPanelFrame'
import { Skinned } from '@/windows/Skinned'

import { SettingsContent } from './SettingsContent'

/** The settings window: settings, skin and about. */
export const SettingsApp: FC = () => {
  return (
    <Skinned>
      <SkinPanelFrame panel="settings" title="Settings">
        <SettingsContent />
      </SkinPanelFrame>
    </Skinned>
  )
}
