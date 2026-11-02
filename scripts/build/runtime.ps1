$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'windows/file-hash.ps1')
$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
$version = '24.21.0'
$cache = Join-Path $projectRoot '.generated/runtime'
New-Item -ItemType Directory -Path $cache -Force | Out-Null
$name = "node-v$version-win-x64.zip"
$archive = Join-Path $cache $name
$sums = (Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$version/SHASUMS256.txt" -TimeoutSec 30).Content
$line = ($sums -split "`n" | Where-Object { $_ -match ('\s+' + [regex]::Escape($name) + '$') } | Select-Object -First 1)
if (-not $line) { throw 'Official runtime checksum not found.' }
$expected = ($line -split '\s+')[0]
if (-not (Test-Path -LiteralPath $archive)) {
    $partial = $archive + '.partial'
    try {
        Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$version/$name" -OutFile $partial -TimeoutSec 180
        if ((Get-ReleaseHash $partial) -ne $expected) { throw 'Runtime checksum mismatch.' }
        Move-Item -LiteralPath $partial -Destination $archive
    } finally { if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force } }
}
if ((Get-ReleaseHash $archive) -ne $expected) { throw 'Cached runtime checksum mismatch.' }
$extracted = Join-Path $cache "node-v$version-win-x64"
Expand-Archive -LiteralPath $archive -DestinationPath $cache -Force
Write-Output $extracted
