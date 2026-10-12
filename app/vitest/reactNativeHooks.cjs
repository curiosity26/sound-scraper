// Lets Vitest load the real react-native package on Node, the job Jest's
// react-native preset does with babel-jest, haste and jest.mock.
//
// React Native ships Flow source and loads its internals with plain require(),
// which Vitest hands straight to Node, so Vite plugins and vi.mock never see
// those files. This installs Node module hooks that:
// - compile react-native, @react-native/* and react-native-gtk4 files with
//   the RN Babel preset,
// - resolve platform files (Foo.ios.js / Foo.native.js before Foo.js),
// - let react-native/jest/setup.js (run by ./setup.ts) reach Libraries/*.
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { fileURLToPath, pathToFileURL } = require('node:url')
const babel = require('@babel/core')

const rnRoot = path.dirname(require.resolve('react-native/package.json'))
// react-native-gtk4's JS (the Linux tests) is Flow too.
const compiled =
  /[\\/]node_modules[\\/](react-native|@react-native|@curiosity26[\\/]react-native-gtk4)[\\/]/
const platformExts = ['.ios.js', '.native.js', '.js']

function withPlatform(file) {
  if (path.extname(file) && fs.existsSync(file)) {
    return null
  }
  for (const ext of platformExts) {
    if (fs.existsSync(file + ext)) {
      return file + ext
    }
  }
  return null
}

function resolveInRN(specifier, parentPath) {
  if (specifier.startsWith('.')) {
    return withPlatform(path.resolve(path.dirname(parentPath), specifier))
  }
  // RN's package.json `exports` hides Libraries/*; Jest's RN resolver drops
  // it, so do the same.
  if (specifier.startsWith('react-native/')) {
    return withPlatform(
      path.join(rnRoot, specifier.slice('react-native/'.length)),
    )
  }
  return null
}

const babelOptions = {
  babelrc: false,
  configFile: false,
  presets: [require.resolve('@react-native/babel-preset')],
  sourceMaps: 'inline',
}
// Load the preset (itself under @react-native/) before the hooks exist.
babel.transformSync('', { ...babelOptions, filename: 'warmup.js' })

// Real file path -> mock factory, filled by the jest.mock stand-in below.
const mocks = new Map()
const actualPrefix = 'rn-actual:'
const mockSuffix = '.vitest-mock.js'

Module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(actualPrefix)) {
      const file = specifier.slice(actualPrefix.length)
      return { url: pathToFileURL(file).href, shortCircuit: true }
    }
    const parentPath = context.parentURL?.startsWith('file:')
      ? fileURLToPath(context.parentURL)
      : null
    const local =
      parentPath && compiled.test(parentPath)
        ? resolveInRN(specifier, parentPath)
        : null
    const url = local
      ? pathToFileURL(local).href
      : nextResolve(specifier, context).url
    const file = url.startsWith('file:') ? fileURLToPath(url) : ''
    // A mocked module gets its own path, so the real file stays loadable
    // (and separately cached) for jest.requireActual.
    return {
      url: mocks.has(file) ? pathToFileURL(file + mockSuffix).href : url,
      shortCircuit: true,
    }
  },
  load(url, context, nextLoad) {
    const file = url.startsWith('file:') ? fileURLToPath(url) : ''
    if (file.endsWith(mockSuffix)) {
      const real = file.slice(0, -mockSuffix.length)
      return {
        format: 'commonjs',
        source: `module.exports = globalThis.__rnMock(${JSON.stringify(real)})`,
        shortCircuit: true,
      }
    }
    const result = nextLoad(url, context)
    if (!compiled.test(file) || !file.endsWith('.js')) {
      return result
    }
    const { code } = babel.transformSync(String(result.source), {
      ...babelOptions,
      filename: file,
    })
    // RN's jest mocks call jest.requireActual with paths relative to
    // themselves, which only a module-local require can resolve.
    const source = code.replaceAll(
      'jest.requireActual(',
      '__rnRequireActual(require, ',
    )
    return { ...result, format: 'commonjs', source }
  },
})

globalThis.__rnRequireActual = (req, id) => {
  const file = req.resolve(id)
  return path.isAbsolute(file) ? req(actualPrefix + file) : req(id)
}
globalThis.__rnMock = file => {
  const entry = mocks.get(file)
  if (!entry.built) {
    entry.built = true
    entry.exports = entry.factory()
  }
  return entry.exports
}

// Runs react-native/jest/setup.js (globals and RN's own component mocks).
// It calls jest.mock/jest.requireActual inside react-native's require() graph,
// so this `jest` stand-in routes them to the hooks above rather than vi.mock.
function setUpReactNative(vi) {
  const rnRequire = Module.createRequire(path.join(rnRoot, 'jest', 'setup.js'))
  const automock = actual =>
    Object.fromEntries(
      Object.entries(actual).map(([key, value]) => [
        key,
        typeof value === 'function' ? vi.fn() : value,
      ]),
    )
  globalThis.jest = {
    fn: vi.fn,
    now: () => Date.now(),
    requireActual: id => rnRequire(id),
    // Later requires of the module get factory() (or an automock), built on
    // first use like Jest's.
    mock: (id, factory) => {
      const file = rnRequire.resolve(id)
      mocks.set(file, {
        factory: factory ?? (() => automock(rnRequire(actualPrefix + file))),
      })
    },
  }
  rnRequire('./setup.js')
}

module.exports = { setUpReactNative }
