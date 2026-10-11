import { settings } from '@/native/settings'
import type { AudioApp } from '@/native/types'

import { safeSettings } from './safeSettings'

export function rememberSource(app: AudioApp | undefined) {
  const current = safeSettings()
  if (!current) {
    return
  }
  const lastSource = app
    ? { kind: 'app' as const, id: app.bundleId, name: app.name }
    : { kind: 'system' as const }
  settings.set({ ...current, lastSource }).catch(() => {})
}
