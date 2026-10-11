import type { AudioApp } from '@/native/types'

import { safeSettings } from './safeSettings'

/** The PID of the remembered app if it's running, else 0 (system audio). */
export function rememberedPid(apps: AudioApp[]): number {
  const last = safeSettings()?.lastSource
  if (last?.kind !== 'app') {
    return 0
  }
  const match = apps.find(
    a => (last.id && a.bundleId === last.id) || a.name === last.name,
  )
  return match?.pid ?? 0
}
