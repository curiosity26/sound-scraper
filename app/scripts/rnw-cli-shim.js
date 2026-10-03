// Preload for the react-native-windows 0.83.2 CLI (codegen-windows,
// autolink-windows, run-windows, and Metro's Windows platform resolution).
//
// Its @react-native-windows/cli requires @react-native-windows/find-dotnet-tools
// without declaring it, and that package's findPowerShell() throws unless
// PowerShell 7 (pwsh.exe) is installed. This falls back to Windows PowerShell
// (Windows) and to a dummy on macOS, where only code generation is needed.
//
// Use: set NODE_OPTIONS="-r <repo>/app/scripts/rnw-cli-shim.js" before the CLI,
// Metro or MSBuild. Remove once react-native-windows ships a fixed CLI.
const Module = require('module');

const fallback = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const originalLoad = Module._load;

Module._load = function (request, ...rest) {
  if (request !== '@react-native-windows/find-dotnet-tools') {
    return originalLoad.call(this, request, ...rest);
  }
  let real;
  try {
    real = originalLoad.call(this, request, ...rest);
  } catch {
    real = {};
  }
  return {
    ...real,
    findPowerShell: () => {
      try {
        return real.findPowerShell();
      } catch {
        return fallback;
      }
    },
  };
};
