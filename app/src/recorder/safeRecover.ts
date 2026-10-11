import { recorder } from '@/native/recorder'

export const safeRecover = (): number => {
  try {
    return recorder.recoverPartials()
  } catch {
    return 0
  }
}
