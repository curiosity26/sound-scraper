# Builds a Release MSIX for Windows and copies it to dist\.
#   .\scripts\package-windows.ps1 [-Platform ARM64|x64] [-Thumbprint <cert SHA1>]
#   .\scripts\package-windows.ps1 [-Platform ARM64|x64] -ArtifactSigning [-Metadata <metadata.json>] [-Publisher <subject>]
#
# Signing, pick one (without either the package is unsigned):
# - Thumbprint: a certificate in Cert:\CurrentUser\My whose Subject equals the
#   manifest's Publisher (a self-signed test cert, or a CA cert on a token).
# - ArtifactSigning: Azure Artifact Signing (formerly Trusted Signing). Needs the
#   Artifact Signing Client Tools (winget install -e --id Microsoft.Azure.ArtifactSigningClientTools),
#   `az login` as a user with the "Artifact Signing Certificate Profile Signer"
#   role, and a metadata.json kept OUTSIDE the repo (default
#   %LOCALAPPDATA%\SoundScraper\signing\metadata.json, or $env:SS_SIGNING_METADATA):
#     { "Endpoint": "https://eus.codesigning.azure.net", "CodeSigningAccountName": "<account>",
#       "CertificateProfileName": "<profile>",
#       "ExcludeCredentials": ["ManagedIdentityCredential", "WorkloadIdentityCredential", "SharedTokenCacheCredential",
#         "VisualStudioCredential", "VisualStudioCodeCredential", "AzurePowerShellCredential",
#         "AzureDeveloperCliCredential", "InteractiveBrowserCredential"] }
#
# -Publisher overrides the manifest's Publisher for this build only (the file is
# restored afterwards). It must equal the signing certificate's subject exactly,
# e.g. "CN=Jane Doe, O=Jane Doe, L=Springfield, S=Illinois, C=US".
param(
  [ValidateSet("ARM64", "x64")] [string]$Platform = "ARM64",
  [string]$Thumbprint = "",
  [switch]$ArtifactSigning,
  [string]$Metadata = $(if ($env:SS_SIGNING_METADATA) { $env:SS_SIGNING_METADATA } else { "$env:LOCALAPPDATA\SoundScraper\signing\metadata.json" }),
  [string]$Publisher = ""
)
$ErrorActionPreference = "Stop"
if ($Thumbprint -and $ArtifactSigning) { throw "Use -Thumbprint or -ArtifactSigning, not both" }
$root = Split-Path -Parent $PSScriptRoot
$env:NODE_OPTIONS = "-r $root\app\scripts\rnw-cli-shim.js"   # RNW 0.83.2 CLI needs it without PowerShell 7
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$msbuild = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find "MSBuild\Current\Bin\arm64\MSBuild.exe" | Select-Object -First 1
if (-not $msbuild) { $msbuild = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find "MSBuild\Current\Bin\MSBuild.exe" | Select-Object -First 1 }

# The Artifact Signing dlib exists only for x64 and x86, so it runs with the x64
# SignTool (emulated on ARM64; needs the x64 .NET 8 runtime, which the Client
# Tools installer brings).
function Find-SignTool {
  $kits = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
  $tool = Get-ChildItem "$kits\10.*\x64\signtool.exe" -ErrorAction SilentlyContinue |
    Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
  if (-not $tool) { throw "x64 signtool.exe not found under $kits (install the Windows SDK)" }
  $tool.FullName
}
function Test-X64 ($path) {
  $b = [IO.File]::ReadAllBytes($path)
  [BitConverter]::ToUInt16($b, [BitConverter]::ToInt32($b, 0x3c) + 4) -eq 0x8664
}
function Find-Dlib {
  if ($env:SS_SIGNING_DLIB) { return $env:SS_SIGNING_DLIB }
  # The Client Tools installer puts it in %LOCALAPPDATA%\Microsoft\MicrosoftArtifactSigningClientTools;
  # the NuGet package has x64\ and x86\ folders.
  $dlib = Get-ChildItem -Recurse -Filter "Azure.CodeSigning.Dlib.dll" -ErrorAction SilentlyContinue `
      "$env:LOCALAPPDATA\Microsoft\MicrosoftArtifactSigningClientTools", "$env:ProgramFiles\Microsoft", "${env:ProgramFiles(x86)}\Microsoft" |
    Where-Object { Test-X64 $_.FullName } |
    Sort-Object { $_.VersionInfo.FileVersionRaw } -Descending | Select-Object -First 1
  if (-not $dlib) { throw "Azure.CodeSigning.Dlib.dll not found. Install the Artifact Signing Client Tools, or set SS_SIGNING_DLIB to the x64 dll" }
  $dlib.FullName
}
if ($ArtifactSigning) {
  if (-not (Test-Path $Metadata)) { throw "Artifact Signing metadata not found at $Metadata (see the top of this script)" }
  $signtool = Find-SignTool
  $dlib = Find-Dlib
}

$manifestPath = "$root\app\windows\SoundScraper.Package\Package.appxmanifest"
$manifestText = [IO.File]::ReadAllText($manifestPath)
$manifest = [xml]$manifestText
$version = $manifest.Package.Identity.Version
if (-not $Publisher) { $Publisher = $manifest.Package.Identity.Publisher }

$patched = $Publisher -ne $manifest.Package.Identity.Publisher
try {
  if ($patched) {
    $manifest.Package.Identity.Publisher = $Publisher
    $manifest.Save($manifestPath)
  }
  # Artifact Signing signs after the build: MSBuild can only sign with a local certificate.
  $signing = if ($Thumbprint) { @("/p:AppxPackageSigningEnabled=true", "/p:PackageCertificateThumbprint=$Thumbprint") } else { @("/p:AppxPackageSigningEnabled=false") }
  & $msbuild "$root\app\windows\SoundScraper.sln" /restore /m /nologo /v:minimal /p:Configuration=Release "/p:Platform=$Platform" `
    /p:AppxBundle=Never /p:UapAppxPackageBuildMode=SideloadOnly @signing
  if ($LASTEXITCODE -ne 0) { throw "MSBuild failed" }
} finally {
  if ($patched) { [IO.File]::WriteAllText($manifestPath, $manifestText, [Text.UTF8Encoding]::new($true)) }
}

$msix = Get-ChildItem -Recurse -Filter "SoundScraper.Package_*_$Platform.msix" "$root\app\windows\SoundScraper.Package\AppPackages" |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
New-Item -ItemType Directory -Force "$root\dist" | Out-Null
$out = "$root\dist\SoundScraper-$version-$Platform.msix"
Copy-Item $msix.FullName $out -Force

if ($ArtifactSigning) {
  # The certificates live three days, so the timestamp is what keeps the signature valid.
  & $signtool sign /v /fd SHA256 /tr "http://timestamp.acs.microsoft.com" /td SHA256 /dlib $dlib /dmdf $Metadata $out
  if ($LASTEXITCODE -ne 0) { throw "signtool failed (signed in with az login? Signer role assigned? Endpoint matches the account's region?)" }
}
if ($Thumbprint -or $ArtifactSigning) {
  $sig = Get-AuthenticodeSignature $out
  $subject = $sig.SignerCertificate.Subject
  # An MSIX installs only when its Publisher is exactly the signer's subject.
  if ($subject -ne $Publisher) { throw "Signed by '$subject' but the package Publisher is '$Publisher'. Rebuild with -Publisher '$subject'" }
  if ($ArtifactSigning -and $sig.Status -ne "Valid") { throw "Signature status: $($sig.Status) $($sig.StatusMessage)" }
}
"Built $out ($([math]::Round((Get-Item $out).Length / 1MB, 1)) MB, signed: $(if ($ArtifactSigning) { 'Artifact Signing' } elseif ($Thumbprint) { 'certificate' } else { 'no' }), publisher: $Publisher)"
