// Linux (GTK4): @curiosity26/react-native-gtk4 is an optional dependency
// (it installs on Linux only), and the CLI only reads platforms and
// commands from regular dependencies, so they're added here when it's
// installed: the `linux` platform, init-linux, run-linux and package-linux.
let linux = null
try {
  linux = require('@curiosity26/react-native-gtk4/react-native.config.js')
} catch {
  // Not on Linux.
}

module.exports = linux
  ? { platforms: linux.platforms, commands: linux.commands }
  : {}
