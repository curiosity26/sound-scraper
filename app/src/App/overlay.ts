// Which side panel the plain UI shows over the library, if any. The title
// bar opens one and the panel closes itself.
export type OverlayName = 'settings' | 'about'

let current: OverlayName | undefined
const listeners = new Set<() => void>()

export const overlay = {
  get: (): OverlayName | undefined => current,
  set: (name: OverlayName | undefined) => {
    current = name
    listeners.forEach(l => {
      l()
    })
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
