# Windows signing

Test builds used to be signed with a self-signed `CN=alexboyce` certificate, which only installs on machines where that certificate was added to Trusted People. For anyone else to double-click the `.msix` and install it, the package has to be signed by a certificate that chains to a root Windows already trusts, or be distributed through the Microsoft Store (which signs it for us).

One rule applies to every route: the manifest's `Publisher` must be exactly the signing certificate's subject. Changing the Publisher changes the package family name, so a package signed for real installs as a different app from the test builds (separate settings and AppData). Uninstall "Sound Scraper" test builds before installing the first real one.

## Options (as of October 2026)

| | Azure Artifact Signing | OV certificate from a CA | Microsoft Store |
|---|---|---|---|
| Cost | $9.99/month (Basic, 5,000 signatures) plus a paid Azure subscription | About $200–$400/year, plus a hardware token or the CA's cloud signing service | Free for individuals |
| Who can get it | Individuals in the US or Canada; companies in the US, Canada, EU, UK and a few more | Anyone the CA can verify | Anyone |
| Identity check | Government ID and a selfie through AU10TIX, result stored as a Verified ID in Microsoft Authenticator. The name and sold-to address on the Azure billing account (type Individual) must match the ID. Usually minutes for individuals; up to 20 business days if documents are requested | ID, sometimes a notarized form or phone callback; days | Partner Center account verification |
| Certificate subject | `CN=<legal name>, O=<legal name>, L=<city>, S=<state>, C=US` (no street address unless you opt in) | Your verified name | A Partner Center GUID (`CN=XXXXXXXX-...`); the Store re-signs |
| Key handling | Keys stay in Microsoft's HSM; certificates rotate every 3 days, the subject stays the same | Since 2023 keys must live on a FIPS token or cloud HSM, so no `.pfx` file | None |
| Updates | Ours (direct download, App Installer) | Ours | Automatic through the Store, after certification review of each release |
| Works with this repo | `package-windows.ps1 -ArtifactSigning` | `package-windows.ps1 -Thumbprint` (token) | Upload an unsigned package built with the Store identity |

EV certificates no longer skip SmartScreen (Microsoft dropped that in 2024), so they aren't worth their extra cost here. SmartScreen reputation matters mostly for `.exe` downloads; a CA-signed MSIX installs through App Installer without the "unknown publisher" block.

## Recommendation

Use **Azure Artifact Signing**. It's the cheapest publicly trusted option for an individual in the US, there's no token to buy or lose, and its subject never changes, so the manifest's Publisher is set once. The Store can be added later as a second channel; it needs its own identity (Name and Publisher from Partner Center) and doesn't block direct downloads.

## What Alex has to do (one time)

1. Create an Azure account with a pay-as-you-go subscription. In Cost Management + Billing, check that the billing account type is **Individual** and that the legal name and sold-to address match your driver's license or passport.
2. In the Azure portal, register the `Microsoft.CodeSigning` resource provider on the subscription (Subscriptions › Resource providers).
3. Create an **Artifact Signing account** (Basic SKU) in a US region, e.g. East US (endpoint `https://eus.codesigning.azure.net`).
4. On the account's Access control (IAM), give yourself **Artifact Signing Identity Verifier** and **Artifact Signing Certificate Profile Signer**.
5. Identity validations › Individual › New identity › Public. Finish the AU10TIX check on your phone and add the Verified ID to Microsoft Authenticator, then share it back.
6. When validation shows Completed, create a **Public Trust** certificate profile. Copy the **Certificate Subject Preview**: that string is the new Publisher.

## Then on the Windows build machine

```powershell
winget install -e --id Microsoft.Azure.ArtifactSigningClientTools   # SignTool plugin, .NET 8, VC++ runtime
winget install -e --id Microsoft.AzureCLI
az login                                                              # as the account with the Signer role
New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\SoundScraper\signing"
@'
{
  "Endpoint": "https://eus.codesigning.azure.net",
  "CodeSigningAccountName": "<account name>",
  "CertificateProfileName": "<profile name>",
  "ExcludeCredentials": ["ManagedIdentityCredential", "WorkloadIdentityCredential", "SharedTokenCacheCredential",
    "VisualStudioCredential", "VisualStudioCodeCredential", "AzurePowerShellCredential",
    "AzureDeveloperCliCredential", "InteractiveBrowserCredential"]
}
'@ | Set-Content "$env:LOCALAPPDATA\SoundScraper\signing\metadata.json"

.\scripts\package-windows.ps1 -Platform ARM64 -ArtifactSigning -Publisher "<Certificate Subject Preview>"
.\scripts\package-windows.ps1 -Platform x64   -ArtifactSigning -Publisher "<Certificate Subject Preview>"
```

`metadata.json` holds no secret (authentication comes from `az login`), but it lives outside the repo anyway. The script builds unsigned, then signs the `.msix` with the x64 SignTool and the Artifact Signing plugin (the plugin has no ARM64 build, so on ARM64 Windows it runs under x64 emulation), timestamps it, and checks that the signer's subject equals the Publisher.

The manifest's Publisher is now that subject, `CN=Alex Boyce, O=Alex Boyce, L=Williamsport, S=pa, C=US` (account `soundscraperalex`, profile `SoundScraperPublic`, East US), so `-Publisher` is only needed if it ever changes. For local test builds after that, make a self-signed certificate with the same subject:

```powershell
New-SelfSignedCertificate -Type Custom -Subject "<same subject>" -KeyUsage DigitalSignature `
  -CertStoreLocation Cert:\CurrentUser\My -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
```

Sources: [Artifact Signing quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart), [SignTool integration](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations), [code signing options for Windows apps](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options), [free Store registration for individuals](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/).
