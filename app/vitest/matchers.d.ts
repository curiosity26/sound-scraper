import type { JestNativeMatchers } from '@testing-library/react-native/dist/matchers/types'

// Testing Library's matchers (registered by ./setup.ts) on Vitest's expect.
// Vitest declares Matchers as an interface with these type parameters, so
// the augmentation has to match it.
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-object-type
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    // eslint-disable-next-line sound-scraper/no-unknown-shape, @typescript-eslint/no-unused-vars -- Vitest's own parameter
    T = unknown,
  > extends JestNativeMatchers<R> {}
}
