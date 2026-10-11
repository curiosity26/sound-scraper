const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const fs = require('fs')
const path = require('node:path')

const rnwPath = fs.realpathSync(
  path.resolve(require.resolve('react-native-windows/package.json'), '..'),
)

// core-js captures built-ins (e.g. Function#toString) when each of its
// modules first loads, then patches them. Inlined requires would defer those
// loads until after the patch, so Function#toString recursed forever on
// Hermes. Its files keep plain top-of-file requires.
const coreJsDir = fs.realpathSync(
  path.resolve(require.resolve('core-js/package.json'), '..'),
)
const coreJsFiles = fs
  .readdirSync(coreJsDir, { recursive: true })
  .filter(f => f.endsWith('.js'))
  .map(f => path.join(coreJsDir, f))

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */

const config = {
  //
  resolver: {
    blockList: [
      // This stops "npx @react-native-community/cli run-windows" from causing the metro server to crash if its already running
      new RegExp(
        `${path.resolve(__dirname, 'windows').replace(/[/\\]/g, '/')}.*`,
      ),
      // This prevents "npx @react-native-community/cli run-windows" from hitting: EBUSY: resource busy or locked, open msbuild.ProjectImports.zip or other files produced by msbuild
      new RegExp(`${rnwPath}/build/.*`),
      new RegExp(`${rnwPath}/target/.*`),
      /.*\.ProjectImports\.zip/,
    ],
    //
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: {
          blockList: Object.fromEntries(coreJsFiles.map(f => [f, true])),
        },
      },
    }),
  },
}

module.exports = mergeConfig(getDefaultConfig(__dirname), config)
