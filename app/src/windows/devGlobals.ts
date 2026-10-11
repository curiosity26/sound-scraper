// Lets the debugger drive the panels in dev builds (see also
// native/SoundScraper.ts). Imported by index.ts for this side effect.
import { selection } from '@/library/selection'
import { windows } from '@/skin/windows'
import { isRecord } from '@/utils/isRecord'

if (__DEV__) {
  const existing: unknown = Reflect.get(globalThis, '__soundScraper')
  Object.assign(globalThis, {
    __soundScraper: {
      ...(isRecord(existing) ? existing : {}),
      selection,
      windows,
    },
  })
}
