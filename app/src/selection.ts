// The recordings selected in the library, shared by the library and the
// details panel (separate windows on one JS runtime). One file name for a
// clicked row; several for a bulk edit of checked rows; none when the
// details panel is closed.
let current: string[] = []
const listeners = new Set<(fileNames: string[]) => void>()

export const selection = {
  get: (): string[] => current,
  set: (fileNames: string[]) => {
    current = fileNames
    listeners.forEach(l => l(fileNames))
  },
  subscribe: (listener: (fileNames: string[]) => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
