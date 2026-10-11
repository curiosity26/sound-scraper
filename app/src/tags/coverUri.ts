/** A file path as an Image source URI (macOS and Windows). */
export function coverUri(path: string): string {
  return path.startsWith('/')
    ? `file://${encodeURI(path)}`
    : `file:///${encodeURI(path.replace(/\\/g, '/'))}`
}
