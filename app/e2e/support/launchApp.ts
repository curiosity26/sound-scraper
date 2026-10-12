import { launchLinuxApp } from './linux/launchLinuxApp'
import type { AppDriver, Sandbox } from './types'

/** Starts the built app with its files in `sandbox` and connects to it. */
export const launchApp = (sandbox: Sandbox): Promise<AppDriver> => {
  if (process.platform === 'linux') {
    return launchLinuxApp(sandbox)
  }
  throw new Error(`no end-to-end driver for ${process.platform} yet`)
}
