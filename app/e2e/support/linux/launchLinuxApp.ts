import { spawn } from 'node:child_process'
import { once } from 'node:events'

import { eventually } from '@e2e/support/eventually'
import type { AppDriver, Sandbox } from '@e2e/support/types'

import { createAtspiBridge } from './createAtspiBridge'

/** The installed package's launcher; E2E_APP points at another build. */
const APP = process.env.E2E_APP ?? '/usr/bin/SoundScraper'

/** The app derives these folders from HOME when they're unset. */
const XDG_DIRS = ['XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME']

/**
 * Starts the Linux app with `sandbox` as its home folder and drives it over
 * AT-SPI (scripts/e2e-linux-session.sh provides the display, accessibility
 * bus and sound server). Resolves once its Record button shows.
 */
export const launchLinuxApp = async (sandbox: Sandbox): Promise<AppDriver> => {
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !XDG_DIRS.includes(k)),
    ),
    HOME: sandbox.home,
  }
  const app = spawn(APP, [], { env, stdio: ['ignore', 'inherit', 'inherit'] })
  const pid = app.pid
  if (pid === undefined) {
    throw new Error(`couldn't start ${APP}`)
  }
  const bridge = createAtspiBridge()
  const running = () => app.exitCode === null && app.signalCode === null

  const driver: AppDriver = {
    find: async query => (await bridge.find(pid, query)) ?? undefined,
    // Like a user, waits for what it presses to show up.
    press: query => eventually(() => bridge.press(pid, query)),
    type: text => bridge.type(pid, text),
    key: key => bridge.key(key),
    names: () => bridge.names(pid),
    quit: async () => {
      if (running()) {
        app.kill('SIGTERM')
        await once(app, 'exit')
      }
      await bridge.close()
    },
  }
  try {
    await eventually(
      async () => {
        if (!running()) {
          throw new Error(
            `${APP} exited (${String(app.exitCode)}) while starting`,
          )
        }
        if (!(await driver.find({ name: 'Record' }))) {
          throw new Error(`${APP} didn't show its Record button`)
        }
      },
      { timeoutMs: 30_000 },
    )
  } catch (e) {
    await driver.quit()
    throw e
  }
  return driver
}
