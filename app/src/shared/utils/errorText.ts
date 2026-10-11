/** A message for any thrown value. */
export const errorText = (e: unknown): string => {
  // Native rejections arrive as Error on macOS but as plain
  // {code, message} objects on Windows.
  if (e instanceof Error) {
    return e.message
  }
  if (typeof e === 'object' && e !== null && 'message' in e) {
    return String(e.message)
  }
  return String(e)
}
