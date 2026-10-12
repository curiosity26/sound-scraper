import { type CodegenTypes, DeviceEventEmitter } from 'react-native'

export type FakeEmitter<T> = {
  /** The spec's event emitter: subscribe a listener. */
  readonly on: CodegenTypes.EventEmitter<T>
  /** Sends `event` to every listener, as the native side would. */
  readonly emit: (event: T) => void
  readonly clear: () => void
}

/**
 * A native module's event emitter, faked on React Native's own emitter:
 * listeners subscribe and the test emits. `name` keeps each fake's events
 * apart.
 */
export const fakeEmitter = <T>(name: string): FakeEmitter<T> => ({
  on: listener =>
    DeviceEventEmitter.addListener(name, (event: T) => {
      void listener(event)
    }),
  emit: event => {
    DeviceEventEmitter.emit(name, event)
  },
  clear: () => {
    DeviceEventEmitter.removeAllListeners(name)
  },
})
