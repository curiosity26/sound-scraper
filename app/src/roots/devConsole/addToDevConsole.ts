/** What the debugger console sees as `__soundScraper`, from every caller. */
let devConsole: Readonly<Record<string, object>> = {}

/**
 * Lets the debugger console drive the same module instances as the UI:
 * adds `entries` to `globalThis.__soundScraper` in dev builds.
 */
export const addToDevConsole = (
  entries: Readonly<Record<string, object>>,
): void => {
  if (__DEV__) {
    devConsole = { ...devConsole, ...entries }
    Object.assign(globalThis, { __soundScraper: devConsole })
  }
}
