// Hermes lacks ES2023's change-array-by-copy and find-from-last methods.
// tsconfig's `lib` is ES2023, so tsc allows them: everything that `lib`
// promises beyond what Hermes ships must be polyfilled here. Raise `lib`
// only together with this list.
import 'core-js/stable/array/find-last'
import 'core-js/stable/array/find-last-index'
import 'core-js/stable/array/to-reversed'
import 'core-js/stable/array/to-sorted'
import 'core-js/stable/array/to-spliced'
import 'core-js/stable/array/with'
import 'core-js/stable/typed-array/find-last'
import 'core-js/stable/typed-array/find-last-index'
import 'core-js/stable/typed-array/to-reversed'
import 'core-js/stable/typed-array/to-sorted'
import 'core-js/stable/typed-array/with'
