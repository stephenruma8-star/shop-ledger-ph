# generate-self-signed-cert.ps1
# Generates a self-signed certificate for development code signing.
# Run as Administrator: powershell -ExecutionPolicy Bypass -File scripts/generate-self-signed-cert.ps1

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=Shop Ledger PH Development" `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -NotAfter (Get-Date).AddYears(3) `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -FriendlyName "Shop Ledger PH Dev Signing"

$certPath = "cert:\CurrentUser\My\$($cert.Thumbprint)"
$password = Read-Host -AsSecureString "Enter password for PFX export"
$pfxPath = ".\certs\shop-ledger-ph-dev.pfx"
New-Item -ItemType Directory -Force -Path ".\certs" | Out-Null
Export-PfxCertificate -Cert $certPath -FilePath $pfxPath -Password $password

Write-Host "Certificate generated successfully!"
Write-Host "Thumbprint: $($cert.Thumbprint)"
Write-Host "PFX saved to: $pfxPath"
Write-Host ""
Write-Host "To use with electron-builder, add to package.json build.win:"
Write-Host '  "certificateFile": "certs/shop-ledger-ph-dev.pfx"'
Write-Host '  "certificatePassword": "your-password"'
