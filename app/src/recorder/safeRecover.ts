import { recorder } from '@/native/recorder'

export function safeRecover(): number {
  try {
    return recorder.recoverPartials()
  } catch {
    return 0
  }
}
