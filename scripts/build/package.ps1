$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Explicit public-file allowlist: never copy .local, .generated, dependencies, accounts, or recordings.
$relativeFiles = @(
    'START HERE.txt', 'Setup Tyrone.cmd', 'Launch Tyrone.cmd', 'Try Tyrone Demo.cmd',
    'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.browser.json',
    'vite.config.ts', 'components.json', 'characters/catalog.json', 'README.md', 'AGENTS.md',
    'PROJECT_HANDOFF.md', 'docs/product-ux.md', 'docs/architecture.md', 'docs/verification.md'
)
foreach ($directory in @('src', 'web', 'scripts', 'characters/prompts', 'config/examples')) {
    $tree = Join-Path $projectRoot $directory
    if ((Get-Item -LiteralPath $tree).Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Packaging refuses linked directories.' }
    $items = @(Get-ChildItem -LiteralPath $tree -Recurse -Force)
    foreach ($item in $items) {
        if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Packaging refuses linked files or directories.' }
        if (-not $item.PSIsContainer -and $item.Extension -in @('.ts', '.tsx', '.ps1', '.css', '.html', '.txt', '.example')) {
            $relativeFiles += $item.FullName.Substring($projectRoot.Length + 1)
        }
    }
}
$outputRoot = Join-Path $projectRoot '.generated/releases'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$destination = Join-Path $outputRoot ('Tyrone-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.zip')
$archive = [System.IO.Compression.ZipFile]::Open($destination, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($relative in ($relativeFiles | Sort-Object -Unique)) {
        $source = Join-Path $projectRoot $relative
        if ((Get-Item -LiteralPath $source).Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Packaging refuses linked files.' }
        $entry = 'Tyrone/' + $relative.Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $source, $entry, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $archive.Dispose() }
Write-Host ('Transfer package: ' + $destination)
