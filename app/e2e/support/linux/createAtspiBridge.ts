import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

import {
  type Guard,
  isArrayOf,
  isBoolean,
  isEither,
  isNullable,
  isOneOf,
  isShape,
  isString,
} from '@/shared/utils/guards'
import type { ElementInfo, Key, Query } from '@e2e/support/types'

const SCRIPT = fileURLToPath(new URL('./atspi-bridge.py', import.meta.url))

type Failure = { readonly ok: false; readonly error: string }
type FindReply = { readonly element: ElementInfo | null }
type NamesReply = { readonly names: readonly string[] }
type Done = { readonly ok: true }

const isFailure = isShape<Failure>({ ok: isOneOf(false), error: isString })
const isElementInfo = isShape<ElementInfo>({
  name: isString,
  role: isString,
  enabled: isBoolean,
  selected: isBoolean,
  checked: isBoolean,
})
const isFindReply = isShape<FindReply>({ element: isNullable(isElementInfo) })
const isNamesReply = isShape<NamesReply>({ names: isArrayOf(isString) })
const isDone = isShape<Done>({ ok: isOneOf(true) })

type Request =
  | ({ readonly op: 'find' | 'press'; readonly app: number } & Query)
  | { readonly op: 'names'; readonly app: number }
  | { readonly op: 'type'; readonly app: number; readonly text: string }
  | { readonly op: 'key'; readonly key: Key }

/** The app process's accessibility tree, through atspi-bridge.py. */
export type AtspiBridge = {
  readonly find: (app: number, query: Query) => Promise<ElementInfo | null>
  readonly press: (app: number, query: Query) => Promise<void>
  readonly type: (app: number, text: string) => Promise<void>
  readonly key: (key: Key) => Promise<void>
  readonly names: (app: number) => Promise<readonly string[]>
  readonly close: () => Promise<void>
}

/**
 * Starts atspi-bridge.py, which looks elements up over AT-SPI. Its Python
 * is the system's (the one with PyGObject); E2E_PYTHON picks another.
 */
export const createAtspiBridge = (): AtspiBridge => {
  const python = process.env.E2E_PYTHON ?? '/usr/bin/python3'
  const child = spawn(python, [SCRIPT], { stdio: ['pipe', 'pipe', 'inherit'] })
  const lines = createInterface({ input: child.stdout })
  const waiting: ((line: string) => void)[] = []
  lines.on('line', line => waiting.shift()?.(line))
  // One request at a time: replies come back in order.
  let queue = Promise.resolve()

  const request = <T>(body: Request, guard: Guard<T>) => {
    const reply = queue.then(
      () =>
        new Promise<T>((resolve, reject) => {
          if (child.exitCode !== null) {
            reject(new Error(`the AT-SPI bridge exited (${child.exitCode})`))
            return
          }
          waiting.push(line => {
            // `find` hands the parsed value straight to the guard.
            const value = [JSON.parse(line)].find(isEither(isFailure, guard))
            if (value === undefined) {
              reject(new TypeError(`Unexpected reply to ${body.op}: ${line}`))
            } else if (isFailure(value)) {
              reject(new Error(value.error))
            } else {
              resolve(value)
            }
          })
          child.stdin.write(`${JSON.stringify(body)}\n`)
        }),
    )
    queue = reply.then(
      () => undefined,
      () => undefined,
    )
    return reply
  }

  return {
    find: async (app, query) =>
      (await request({ op: 'find', app, ...query }, isFindReply)).element,
    press: async (app, query) => {
      await request({ op: 'press', app, ...query }, isDone)
    },
    type: async (app, text) => {
      await request({ op: 'type', app, text }, isDone)
    },
    key: async key => {
      await request({ op: 'key', key }, isDone)
    },
    names: async app =>
      (await request({ op: 'names', app }, isNamesReply)).names,
    close: async () => {
      if (child.exitCode === null) {
        child.stdin.end()
        await once(child, 'exit')
      }
    },
  }
}
