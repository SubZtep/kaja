# kaja autoinstall (Windows)
# Usage:  irm https://kaja.io/install.ps1 | iex
# Optional: set $env:REPO, $env:VERSION, or $env:INSTALL_DIR in the same shell first, e.g.:
#   $env:REPO = 'myfork/kaja'; irm https://kaja.io/install.ps1 | iex
#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

Write-Host "kaja autoinstall"
Write-Host "░▒▓█▇▅▃▂▂▃▅▇█▓▒░"
Write-Host ""

$Repo = if ($env:REPO) { $env:REPO } else { "subztep/kaja" }
$Version = $env:VERSION
$InstallDir = if ($env:INSTALL_DIR) { $env:INSTALL_DIR } else { Join-Path $HOME ".local\bin" }

$manifestUrl = if ($Version) {
  "https://github.com/$Repo/releases/download/$Version/manifest.json"
} else {
  "https://github.com/$Repo/releases/latest/download/manifest.json"
}

if ($Version) { Write-Host "Fetching manifest for $Version..." } else { Write-Host "Fetching latest release manifest..." }
$manifestText = (Invoke-WebRequest -Uri $manifestUrl -UseBasicParsing).Content
$m = $manifestText | ConvertFrom-Json
$w = $m.platforms.'windows-x64'
if (-not $w -or -not $w.artifact) {
  Write-Host "No build for platform: windows-x64" -ForegroundColor Red
  exit 1
}

$base = $m.base_url.TrimEnd("/")
$art = $w.artifact
$sum = if ($w.checksum) { $w.checksum } else { $null }
$ver = $m.version
$downloadUrl = "$base/$art"
Write-Host "Downloading kaja $ver for windows-x64..."

$null = New-Item -ItemType Directory -Force -Path $InstallDir
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("kaja-" + [Guid]::NewGuid() + ".tmp")
try {
  Invoke-WebRequest -Uri $downloadUrl -OutFile $tmp -UseBasicParsing
  if ($sum) {
    Write-Host "Verifying checksum..."
    $h = (Get-FileHash -Path $tmp -Algorithm SHA256).Hash
    if ($h.ToLowerInvariant() -ne $sum.ToLowerInvariant()) {
      Write-Host "Checksum mismatch! Expected: $sum, Got: $h" -ForegroundColor Red
      exit 1
    }
    Write-Host "Checksum verified."
  }
  $out = Join-Path $InstallDir "kaja.exe"
  Move-Item -Path $tmp -Destination $out -Force
} finally {
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
}

Write-Host "Installed kaja $ver to $out"

$normInstall = (Resolve-Path $InstallDir -ErrorAction SilentlyContinue).Path
if (-not $normInstall) { $normInstall = $InstallDir }
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$already = $false
if ($userPath) {
  foreach ($p in $userPath.Split(";")) {
    if ($p -and ($p -ieq $normInstall)) { $already = $true; break }
  }
}
if (-not $already) {
  Write-Host ""
  Write-Host "IMPORTANT: Add the install directory to your User PATH, then open a new terminal."
  $hint = "[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User') + ';" + $normInstall + "', 'User')"
  Write-Host "Example:"
  Write-Host "  $hint"
  Write-Host ""
  Write-Host "Run 'kaja' to get started!"
}
