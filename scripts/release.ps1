param([switch]$Sign, [switch]$Development)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$configPath = $null
if ($Sign) {
    if (-not $env:MM_SIGN_CERT_THUMBPRINT) { throw 'Set MM_SIGN_CERT_THUMBPRINT to an installed publisher certificate to opt in to signing.' }
    $certificate = Get-ChildItem Cert:/CurrentUser/My -CodeSigningCert | Where-Object Thumbprint -eq $env:MM_SIGN_CERT_THUMBPRINT
    if (-not $certificate -or -not $certificate.HasPrivateKey) { throw 'The selected signing certificate/private key is unavailable.' }
    $configPath = Join-Path $projectRoot '.tools/release-signing.json'
    New-Item -ItemType Directory -Force (Split-Path $configPath -Parent) | Out-Null
    $signingConfig = @{ bundle = @{ windows = @{ certificateThumbprint = $env:MM_SIGN_CERT_THUMBPRINT; digestAlgorithm = 'sha256'; timestampUrl = 'http://timestamp.digicert.com' } } } | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText($configPath, $signingConfig, [System.Text.UTF8Encoding]::new($false))
}
Push-Location $projectRoot
try {
    npm.cmd run check
    if ($LASTEXITCODE -ne 0) { throw 'Frontend checks failed.' }
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/rust.ps1 -Task test
    if ($LASTEXITCODE -ne 0) { throw 'Ledger checks failed.' }
    npx.cmd playwright test
    if ($LASTEXITCODE -ne 0) { throw 'Browser checks failed.' }
    $buildTask = if ($Development) { 'installer' } else { 'build' }
    if ($configPath) { powershell -NoProfile -ExecutionPolicy Bypass -File scripts/rust.ps1 -Task $buildTask -BuildConfig $configPath }
    else { powershell -NoProfile -ExecutionPolicy Bypass -File scripts/rust.ps1 -Task $buildTask }
    if ($LASTEXITCODE -ne 0) { throw 'Installer build failed.' }
    $profile = if ($Development) { 'debug' } else { 'release' }
    $installers = Get-ChildItem (Join-Path $projectRoot "src-tauri/target/$profile/bundle/nsis") -Filter '*.exe'
    if (-not $installers) { throw 'No installer was produced.' }
    if ($Sign) {
        $binary = Get-Item (Join-Path $projectRoot "src-tauri/target/$profile/money-manager.exe")
        foreach ($artifact in @($installers) + @($binary)) {
            if ((Get-AuthenticodeSignature -LiteralPath $artifact.FullName).Status -ne 'Valid') { throw 'Artifact signature validation failed.' }
        }
    }
    $installers | Select-Object FullName, Length
    Write-Output 'Installer created. Signing is unset unless -Sign was explicitly requested.'
} finally { Pop-Location }
