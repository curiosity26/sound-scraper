# Builds a Release MSIX for Windows and copies it to dist\.
#   .\scripts\package-windows.ps1 [-Platform ARM64|x64] [-Thumbprint <cert SHA1>]
# The certificate must be in Cert:\CurrentUser\My with Subject "CN=alexboyce"
# (the manifest's Publisher). Without -Thumbprint the package is unsigned.
param(
  [ValidateSet("ARM64", "x64")] [string]$Platform = "ARM64",
  [string]$Thumbprint = ""
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$env:NODE_OPTIONS = "-r $root\app\scripts\rnw-cli-shim.js"   # RNW 0.83.2 CLI needs it without PowerShell 7
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$msbuild = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find "MSBuild\Current\Bin\arm64\MSBuild.exe" | Select-Object -First 1
if (-not $msbuild) { $msbuild = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find "MSBuild\Current\Bin\MSBuild.exe" | Select-Object -First 1 }

$signing = if ($Thumbprint) { @("/p:AppxPackageSigningEnabled=true", "/p:PackageCertificateThumbprint=$Thumbprint") } else { @("/p:AppxPackageSigningEnabled=false") }
& $msbuild "$root\app\windows\SoundScraper.sln" /restore /m /nologo /v:minimal /p:Configuration=Release "/p:Platform=$Platform" `
  /p:AppxBundle=Never /p:UapAppxPackageBuildMode=SideloadOnly @signing
if ($LASTEXITCODE -ne 0) { throw "MSBuild failed" }

$msix = Get-ChildItem -Recurse -Filter "SoundScraper.Package_*_$Platform.msix" "$root\app\windows\SoundScraper.Package\AppPackages" |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
New-Item -ItemType Directory -Force "$root\dist" | Out-Null
$version = ([xml](Get-Content "$root\app\windows\SoundScraper.Package\Package.appxmanifest")).Package.Identity.Version
$out = "$root\dist\SoundScraper-$version-$Platform.msix"
Copy-Item $msix.FullName $out -Force
"Built $out ($([math]::Round((Get-Item $out).Length / 1MB, 1)) MB, signed: $([bool]$Thumbprint))"
