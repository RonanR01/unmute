# Signs one Windows file with Tysta's code-signing certificate.
#
# Tauri calls this script for every executable, DLL and installer it builds,
# through the signCommand in src-tauri/tauri.sign-windows.conf.json. That file
# is only added to the build (--config) when release.yml signs, so an unsigned
# build never runs this script.
#
# Provider: SSL.com eSigner, a cloud signing service that works from CI
# (specs/002-build-sign-release/research.md, R3). Changing provider means
# changing this script and nothing else.
#
# Secrets (environment, never printed): ES_USERNAME, ES_PASSWORD,
# ES_CREDENTIAL_ID, ES_TOTP_SECRET. See docs/publier.md.

param(
    [Parameter(Mandatory = $true)]
    [string]$File
)

$ErrorActionPreference = 'Stop'

# CodeSignTool, pinned: version and SHA-256 of the archive checked on 2026-11-20.
$CodeSignToolVersion = '1.3.2'
$CodeSignToolUrl = "https://github.com/SSLcom/CodeSignTool/releases/download/v$CodeSignToolVersion/CodeSignTool-v$CodeSignToolVersion-windows.zip"
$CodeSignToolSha256 = '4afc32e8b7f79bbe1de7e4e7049aaad4e0f754357613b9bbec0e3052f06fd36b'

$required = @('ES_USERNAME', 'ES_PASSWORD', 'ES_CREDENTIAL_ID', 'ES_TOTP_SECRET')
$missing = $required | Where-Object { -not [Environment]::GetEnvironmentVariable($_) }
if ($missing) {
    throw "Signature Windows impossible : secrets manquants ($($missing -join ', ')). Voir docs/publier.md."
}

if (-not (Test-Path -LiteralPath $File)) {
    throw "Fichier à signer introuvable : $File"
}

# Download once per build: Tauri calls this script many times.
$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$toolDir = Join-Path $tempRoot "CodeSignTool-$CodeSignToolVersion"
$launcher = Join-Path $toolDir 'CodeSignTool.bat'
if (-not (Test-Path -LiteralPath $launcher)) {
    $archive = Join-Path $tempRoot "CodeSignTool-$CodeSignToolVersion.zip"
    Invoke-WebRequest -Uri $CodeSignToolUrl -OutFile $archive -UseBasicParsing
    $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $CodeSignToolSha256) {
        throw "Empreinte inattendue pour CodeSignTool $CodeSignToolVersion : $actual"
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $toolDir -Force
}

$fullPath = (Resolve-Path -LiteralPath $File).Path
Write-Host "Signature de $([System.IO.Path]::GetFileName($fullPath))"

# CodeSignTool resolves conf/ and jdk/ relative to its own folder.
Push-Location $toolDir
try {
    $output = & cmd.exe /c CodeSignTool.bat sign `
        "-username=$env:ES_USERNAME" `
        "-password=$env:ES_PASSWORD" `
        "-credential_id=$env:ES_CREDENTIAL_ID" `
        "-totp_secret=$env:ES_TOTP_SECRET" `
        "-input_file_path=$fullPath" `
        '-override=true' 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

# CodeSignTool can exit 0 on failure: trust its message as well.
if ($exitCode -ne 0 -or $output -notmatch 'Code signed successfully') {
    $safe = $output
    foreach ($name in $required) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if ($value) { $safe = $safe.Replace($value, '***') }
    }
    Write-Host $safe
    throw "La signature de $fullPath a échoué (code $exitCode)."
}

Write-Host "Signé : $([System.IO.Path]::GetFileName($fullPath))"
