$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
Set-Location -LiteralPath $projectRoot
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed; no release package was published.' }
$productOutput = & node scripts/build/product.ts
if ($LASTEXITCODE -ne 0) { throw 'Product preparation failed; no release package was published.' }
$productRoot = [System.IO.Path]::GetFullPath(($productOutput | Select-Object -Last 1))
$packageWorkspace = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.generated/packages'))
if (-not $productRoot.StartsWith($packageWorkspace + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid product staging path.' }
$productStagingRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $productRoot))
if (-not [System.StringComparer]::OrdinalIgnoreCase.Equals((Split-Path -Parent $productStagingRoot), $packageWorkspace)) { throw 'Invalid product staging cleanup path.' }

try {
    $outputRoot = Join-Path $projectRoot '.generated/releases'
    New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
    $destination = Join-Path $outputRoot ('MomoiTTS-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.zip')
    $staging = $destination + '.partial'
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
        Move-Item -LiteralPath $staging -Destination $destination
    } catch {
        if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Force }
        throw
    }
    Write-Host ('Transfer package: ' + $destination)
} finally {
    if (Test-Path -LiteralPath $productStagingRoot) { Remove-Item -LiteralPath $productStagingRoot -Recurse -Force }
}
