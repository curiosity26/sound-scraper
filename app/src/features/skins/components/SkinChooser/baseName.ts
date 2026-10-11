/** A path's last component (a file or folder name). */
export const baseName = (path: string): string => {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}
