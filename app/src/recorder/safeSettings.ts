import { settings } from '@/native/settings'

export const safeSettings = () => {
  try {
    return settings.get()
  } catch {
    return undefined
  }
}
