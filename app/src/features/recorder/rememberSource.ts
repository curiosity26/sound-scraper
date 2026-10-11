import type { AudioApp } from '@/bridge/types'
import { settings } from '@/features/settings/settings'

import { safeSettings } from './safeSettings'

export const rememberSource = (app: AudioApp | undefined) => {
  const current = safeSettings()
  if (!current) {
    return
  }
  const lastSource = app
    ? { kind: 'app' as const, id: app.bundleId, name: app.name }
    : { kind: 'system' as const }
  settings.set({ ...current, lastSource }).catch(() => {})
}
