import { recorder } from './recorder'

export const safeRecover = (): number => {
  try {
    return recorder.recoverPartials()
  } catch {
    return 0
  }
}
