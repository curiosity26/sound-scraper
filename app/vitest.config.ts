import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'

const require = createRequire(import.meta.url)

// Names the app, tests and test fakes import from react-native.
const usedNames = (dirs: readonly string[]) =>
  new Set(
    dirs.flatMap(dir =>
      readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter(file => /\.tsx?$/.test(file))
        .flatMap(file =>
          Array.from(
            readFileSync(join(dir, file), 'utf8').matchAll(
              /import\s*\{([^}]*)\}\s*from\s*'react-native'/g,
            ),
            ([, list = '']) =>
              list.split(',').map(n => n.trim().split(/\s/).pop()),
          ).flat(),
        ),
    ),
  )

// react-native's index.js is CommonJS made of lazy getters, which Node can't
// turn into named ESM exports, so `import { View } from 'react-native'` would
// come back undefined. This serves an ESM wrapper that re-exports the getters
// the code uses (all of them would load every RN module, some of which throw
// without their native side).
const reactNativeEsm = (): Plugin => {
  const id = '\0react-native-esm'
  const entry = require.resolve('react-native')
  const used = usedNames(['src', 'vitest'])
  const names = Array.from(
    readFileSync(entry, 'utf8').matchAll(/^ {2}get (\w+)\(\)/gm),
    ([, name]) => name,
  ).filter(name => used.has(name))
  return {
    name: 'react-native-esm',
    enforce: 'pre',
    resolveId: source => (source === 'react-native' ? id : null),
    load: loaded =>
      loaded === id
        ? [
            "import { createRequire } from 'node:module'",
            `const rn = createRequire(${JSON.stringify(
              entry,
            )})(${JSON.stringify(entry)})`,
            'export default rn',
            ...names.map(n => `export const ${n} = rn.${n}`),
          ].join('\n')
        : null,
  }
}

export default defineConfig({
  plugins: [reactNativeEsm()],
  resolve: {
    alias: {
      '@test': fileURLToPath(new URL('./vitest', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest/setup.ts'],
    // Testing Library registers its matchers and cleanup on the globals.
    // Tests still import describe, it and expect from vitest.
    globals: true,
    server: { deps: { external: [/node_modules/] } },
  },
})
