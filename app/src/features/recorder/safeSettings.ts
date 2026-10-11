import { settings } from '@/features/settings/settings'

export const safeSettings = () => {
  try {
    return settings.get()
  } catch {
    return undefined
  }
}
