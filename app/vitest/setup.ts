import { createRequire } from 'node:module'
import { vi } from 'vitest'

import { setUpReactNative } from './reactNativeHooks.cjs'

setUpReactNative(vi)

// Testing Library loads react-native, so it comes after the hooks above.
// It's required (not imported) so react-native's require cycles resolve the
// way they do under CommonJS. It adds its matchers to the global expect and
// cleans up after each test.
createRequire(import.meta.url)('@testing-library/react-native')
