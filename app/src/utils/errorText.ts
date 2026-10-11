import { isRecord } from './isRecord'

/** A message for any thrown value. */
export const errorText = (e: unknown): string => {
  // Native rejections arrive as Error on macOS but as plain
  // {code, message} objects on Windows.
  if (e instanceof Error) {
    return e.message
  }
  if (isRecord(e) && 'message' in e) {
    return String(e.message)
  }
  return String(e)
}
