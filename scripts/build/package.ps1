$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
Set-Location -LiteralPath $projectRoot
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed; no release package was published.' }
$env:MOMOI_TTS_PACKAGE_RUNTIME = & (Join-Path $PSScriptRoot 'runtime.ps1')
$runtimeStaging = [System.IO.Path]::GetFullPath($env:MOMOI_TTS_PACKAGE_RUNTIME)
$runtimeWorkspace = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.generated/runtime'))
if (-not [System.StringComparer]::OrdinalIgnoreCase.Equals((Split-Path -Parent $runtimeStaging), $runtimeWorkspace) -or (Split-Path -Leaf $runtimeStaging) -notmatch '^node-v[0-9.]+-win-x64$') { throw 'Invalid runtime staging cleanup path.' }
$productStagingRoot = $null

try {
    $productOutput = & node scripts/build/product.ts
    if ($LASTEXITCODE -ne 0) { throw 'Product preparation failed; no release package was published.' }
    $productRoot = [System.IO.Path]::GetFullPath(($productOutput | Select-Object -Last 1))
    $packageWorkspace = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.generated/packages'))
    if (-not $productRoot.StartsWith($packageWorkspace + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid product staging path.' }
    $candidateStagingRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $productRoot))
    if (-not [System.StringComparer]::OrdinalIgnoreCase.Equals((Split-Path -Parent $candidateStagingRoot), $packageWorkspace)) { throw 'Invalid product staging cleanup path.' }
    $productStagingRoot = $candidateStagingRoot
    $outputRoot = Join-Path $projectRoot '.generated/releases'
    New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
    $releaseVersion = (Get-Content -LiteralPath (Join-Path $productRoot 'release.json') -Raw | ConvertFrom-Json).version
    if ($releaseVersion -notmatch '^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$') { throw 'Invalid release version for package filename.' }
    $destination = Join-Path $outputRoot ('MomoiTTS-v' + $releaseVersion + '.zip')
    $staging = $destination + '.' + [guid]::NewGuid().ToString('N') + '.partial'
    try {
        $archive = [System.IO.Compression.ZipFile]::Open($staging, [System.IO.Compression.ZipArchiveMode]::Create)
        try {
            foreach ($item in (Get-ChildItem -LiteralPath $productRoot -Recurse -Force)) {
                if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Packaging refuses linked files or directories.' }
                if ($item.PSIsContainer) { continue }
                $relative = $item.FullName.Substring($productRoot.Length + 1).Replace('\', '/')
                [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $item.FullName, ('MomoiTTS/' + $relative), [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
            }
        } finally { $archive.Dispose() }
        if (Test-Path -LiteralPath $destination) {
            [System.IO.File]::Replace($staging, $destination, [System.Management.Automation.Language.NullString]::Value)
        } else {
            [System.IO.File]::Move($staging, $destination)
        }
    } catch {
        if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Force }
        throw
    }
    Write-Host ('Transfer package: ' + $destination)
} finally {
    if ($productStagingRoot -and (Test-Path -LiteralPath $productStagingRoot)) { Remove-Item -LiteralPath $productStagingRoot -Recurse -Force }
    if (Test-Path -LiteralPath $runtimeStaging) { Remove-Item -LiteralPath $runtimeStaging -Recurse -Force }
    Remove-Item Env:MOMOI_TTS_PACKAGE_RUNTIME
}
