# Code Signing

## Why Code Signing Matters

When users download an unsigned `.exe` installer, Windows SmartScreen shows a scary
**"Windows protected your PC"** warning. Many users will click away and never install
your app. A valid code signing certificate eliminates this warning and builds trust.

- **Without signing**: SmartScreen blocks the download with a red warning
- **With self-signed cert**: SmartScreen still shows a warning, but it's less alarming
- **With a real cert** (DigiCert, Sectigo, etc.): SmartScreen shows no warning at all

## Getting a Real Certificate

For production releases, purchase a code signing certificate from a trusted Certificate
Authority (CA):

| CA | Website | Notes |
|----|---------|-------|
| DigiCert | https://www.digicert.com/code-signing/ | Most trusted, ~$223/yr |
| Sectigo | https://www.sectigo.com/code-signing | Affordable, ~$80/yr |
| Certum | https://www.certum.eu/code-signing/ | EU-based, ~$60/yr |

Steps:
1. Purchase a certificate from the CA of your choice
2. Complete domain validation and identity verification
3. Download the `.pfx` file from the CA
4. Use the `.pfx` in your build process

## Using the Self-Signed Certificate (Development)

Run the generation script as Administrator:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-self-signed-cert.ps1
```

This creates a `.pfx` file at `certs/shop-ledger-ph-dev.pfx`.

## Configuring electron-builder

Add the certificate settings to the `build.win` section of `package.json`:

```json
{
  "build": {
    "win": {
      "certificateFile": "certs/shop-ledger-ph-dev.pfx",
      "certificatePassword": "your-password"
    }
  }
}
```

**Security**: Never commit your `.pfx` file or password to git. Add `certs/` to `.gitignore`:

```
certs/
```

For CI/CD, store the certificate contents as a base64-encoded GitHub secret and decode
it during the build step:

```yaml
- name: Decode certificate
  run: |
    echo "${{ secrets.CERT_BASE64 }}" | base64 -d > certs/shop-ledger-ph-dev.pfx
```
