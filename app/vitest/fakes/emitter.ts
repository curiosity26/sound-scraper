import { type CodegenTypes, DeviceEventEmitter } from 'react-native'

export type FakeEmitter<T> = {
  /** The spec's event emitter: subscribe a listener. */
  readonly on: CodegenTypes.EventEmitter<T>
  /** Sends `event` to every listener, as the native side would. */
  readonly emit: (event: T) => void
  /** Drops every listener (for a test that reloads the modules listening). */
  readonly clear: () => void
}

/**
 * A native module's event emitter, faked on React Native's own emitter:
 * listeners subscribe and the test emits. `name` keeps each fake's events
 * apart. Listeners stay across tests: the app's stores subscribe once for
 * their lifetime, and components unsubscribe when they unmount.
 */
export const fakeEmitter = <T>(name: string): FakeEmitter<T> => ({
  on: listener =>
    DeviceEventEmitter.addListener(name, (event: T) => {
      // A listener that rejects fails the test, as an unhandled rejection
      // would in the app.
      Promise.resolve(listener(event)).catch((e: unknown) => {
        queueMicrotask(() => {
          throw e
        })
      })
    }),
  emit: event => {
    DeviceEventEmitter.emit(name, event)
  },
  clear: () => {
    DeviceEventEmitter.removeAllListeners(name)
  },
})
