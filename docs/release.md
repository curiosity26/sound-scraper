# Releasing

Pushing a version tag runs [.github/workflows/release.yml](../.github/workflows/release.yml):

```sh
scripts/version.py set 0.2.0            # or 0.2.0-beta.1 for a pre-release
git commit -am "Version 0.2.0"
git tag v0.2.0 && git push origin HEAD v0.2.0
```

It builds, on GitHub-hosted runners:

- `SoundScraper-0.2.0.dmg`: Apple silicon, signed with Developer ID, notarized and stapled (macos-26, `scripts/package-macos.sh`).
- `SoundScraper-0.2.0.0-ARM64.msix` and `SoundScraper-0.2.0.0-x64.msix`: signed with Azure Artifact Signing (windows-2025, cross-compiled, `scripts/package-windows.ps1 -ArtifactSigning`).
- The GTK4 app for Linux, x86_64 and aarch64, unsigned. Each package links its distribution's libraries, so each is built on that release:
  - `sound-scraper_0.2.0-1_ubuntu24.04_<amd64|arm64>.deb` for Ubuntu 24.04, Mint 22 and newer, and `SoundScraper-0.2.0-linux-<x86_64|aarch64>.tar.gz` (ubuntu-24.04 and ubuntu-24.04-arm, `react-native package-linux`).
  - `sound-scraper_0.2.0-1_debian13_<amd64|arm64>.deb`, `sound-scraper-0.2.0-1.fc44.<x86_64|aarch64>.rpm` and `sound-scraper-0.2.0-1.el10.<x86_64|aarch64>.rpm` (RHEL, CentOS Stream, AlmaLinux and Rocky 10), each built, installed and started in a container of its distribution (`scripts/package-linux-in-container.sh`; locally with podman or docker). Debian 13 and EL 10 are the oldest releases with GTK 4.14, which react-native-gtk4 needs. Fedora's package is for one release: move `fc44` to the next one in the workflow when it ships.
  - `SoundScraper-0.2.0-<x86_64|aarch64>.flatpak`: built from source in the GNOME SDK with no network, as Flathub requires (`scripts/package-flatpak.sh`), then installed and started. It isn't on Flathub; submitting it means a Flathub pull request with the manifest (`app/linux/build/package/flatpak/`) and the release's source archive.
- `HiFi74.sskin` and any other skin in `skins/` except the built-in Default, packaged by the `package_skin` example.

and publishes them, with a `SHA256SUMS.txt`, as a GitHub Release with generated notes. A tag with a `-label` becomes a pre-release.

**Dry run:** add the label `release-dry-run` to a pull request (each later push to it runs again), or use *Run workflow* on the Release workflow. Every package is built for `package.json`'s version without the `release` environment's secrets, so the Mac app is ad-hoc signed and not notarized and the `.msix` is unsigned. The packages are the run's artifacts, and nothing is published. The jobs use an environment named `release-dry-run`, which has no secrets; GitHub creates it on the first run.

The tag must match the version in every project file, or the run stops before building: `app/package.json` (and its lock) and the Cargo workspace (and `Cargo.lock`) hold the full version, e.g. `0.2.0-beta.1`; Xcode's `MARKETING_VERSION` and the MSIX manifest only take numbers, so they hold `0.2.0` and `0.2.0.0`. `scripts/version.py set` writes all of them, and `scripts/version.py` with no arguments lists them. The run number becomes the Mac build number (`CFBundleVersion`).

No secret is in the repo. Everything below lives in GitHub secrets, the Apple Developer account and Azure.

## One-time setup

### 1. GitHub environment

Settings › Environments › **New environment** `release`. Under *Deployment branches and tags*, pick **Selected branches and tags** and add a **tag** rule `v*`. The Mac and Windows jobs run in this environment, so its secrets only reach builds of `v*` tags, and Azure trusts only this environment (step 3).

All secrets below are **environment secrets** of `release` (Settings › Environments › release › Add environment secret), or set them with `gh secret set NAME --env release`.

### 2. Apple

**Developer ID certificate.** In Keychain Access › login › My Certificates, right-click *Developer ID Application: Alex Boyce (B53W8TX3Q9)* (with its private key) › Export › `.p12`, with a strong password. Then:

```sh
base64 -i DeveloperID.p12 | gh secret set MACOS_DEVELOPER_ID_P12 --env release
gh secret set MACOS_DEVELOPER_ID_P12_PASSWORD --env release   # paste the export password
rm DeveloperID.p12
```

**Notarization API key** (instead of the local `soundscraper-notary` keychain profile). App Store Connect › Users and Access › Integrations › App Store Connect API › Team Keys › **Generate API Key**, name `Sound Scraper notarization`, access **Developer**. Download the `.p8` (it can be downloaded only once), and note the **Key ID** and the **Issuer ID** at the top of the page.

```sh
gh secret set APPLE_NOTARY_KEY_P8 --env release < AuthKey_XXXXXXXXXX.p8
gh secret set APPLE_NOTARY_KEY_ID --env release      # Key ID
gh secret set APPLE_NOTARY_ISSUER_ID --env release   # Issuer ID
```

Keep the `.p8` somewhere safe (a password manager) or delete it; a new key can always be generated.

### 3. Azure (sign-in without a stored password)

GitHub signs in to Azure with a short-lived OIDC token; nothing long-lived is stored.

1. Microsoft Entra ID › App registrations › **New registration**, name `sound-scraper-github-release`, single tenant, no redirect URI. Note the **Application (client) ID** and **Directory (tenant) ID** on its Overview.
2. In that app: Certificates & secrets › **Federated credentials** › Add credential › *GitHub Actions deploying Azure resources*: organization `curiosity26`, repository `sound-scraper` (repository ID `1403706095`, owner ID `4050934`), entity type **Environment**, environment `release`, name `github-release`. The repo uses GitHub's immutable OIDC subjects, so the subject must be `repo:curiosity26@4050934/sound-scraper@1403706095:environment:release` (check with `gh api repos/curiosity26/sound-scraper/actions/oidc/customization/sub`).
3. The Artifact Signing account `soundscraperalex` (resource group `soundscraper-signing`) › Access control (IAM) › Add role assignment › **Artifact Signing Certificate Profile Signer** › Members: *User, group, or service principal* › select `sound-scraper-github-release`.
4. Secrets:

```sh
gh secret set AZURE_CLIENT_ID --env release   # Application (client) ID
gh secret set AZURE_TENANT_ID --env release   # Directory (tenant) ID
```

The account name, profile (`SoundScraperPublic`) and East US endpoint are in the workflow; they aren't secret.

## Notes

- Each run checks the signatures: the Mac script runs `codesign --verify`, `stapler` and `spctl`; the Windows script checks that the signer's subject equals the manifest's Publisher and that the signature is Valid.
- On a private repository, releases are visible only to people with access to the repo, and macOS runner minutes count ten times against the plan's included minutes.
- The Linux packages aren't signed: apt and dnf don't check package signatures for local files (only repositories are signed), and a Flatpak bundle carries none.
- A failed run can be retried from the Actions tab (Re-run failed jobs). To redo a release from scratch, delete the GitHub Release and the tag, then push the tag again.
