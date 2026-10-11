import { settings } from '@/native/settings'

export function safeSettings() {
  try {
    return settings.get()
  } catch {
    return undefined
  }
}
