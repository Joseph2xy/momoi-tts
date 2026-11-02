param([string]$ArchivePath, [switch]$NoDialog)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'file-hash.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$target = [System.IO.Path]::GetFullPath((Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
$work = Join-Path $target ('.update-work-' + [guid]::NewGuid().ToString('N'))
if (-not [System.StringComparer]::OrdinalIgnoreCase.Equals((Split-Path -Parent $work), $target)) { throw 'Invalid update workspace.' }
$stage = Join-Path $work 'stage'
$backup = Join-Path $work 'backup'
$changed = @()
$installed = $false
$rollbackFailed = $false
$progressForm = $null
function Update-Progress([string]$Text) {
    if ($progressForm) { $progressLabel.Text = $Text; [System.Windows.Forms.Application]::DoEvents() }
}
function Public-Path([string]$relative) {
    if ($relative -notmatch '^(src|scripts|characters|config|web-build|node_modules|runtime)/' -and $relative -notin @('README.md', 'START HERE.txt', 'Launch MomoiTTS.cmd', 'Update MomoiTTS.cmd', 'THIRD PARTY NOTICES.txt', 'package.json', 'package-lock.json', 'release.json')) { throw 'Release contains an unsupported path.' }
    if ($relative -match '\\|:|(^|/)\.|[\x00-\x1f]' -or [System.IO.Path]::IsPathRooted($relative)) { throw 'Release contains an unsafe path.' }
    $absolute = [System.IO.Path]::GetFullPath((Join-Path $target $relative))
    if (-not $absolute.StartsWith($target + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Release path escapes the app folder.' }
    $parent = Split-Path -Parent $absolute
    while ($parent.Length -ge $target.Length) {
        if ((Test-Path -LiteralPath $parent) -and ((Get-Item -LiteralPath $parent -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw 'Update refuses linked paths.' }
        if ([System.StringComparer]::OrdinalIgnoreCase.Equals($parent, $target)) { break }
        $parent = Split-Path -Parent $parent
    }
    if ((Test-Path -LiteralPath $absolute) -and ((Get-Item -LiteralPath $absolute -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw 'Update refuses linked files.' }
    return $absolute
}
try {
    if (-not $ArchivePath) {
        Add-Type -AssemblyName System.Windows.Forms
        $picker = New-Object System.Windows.Forms.OpenFileDialog
        $picker.Title = 'Select the downloaded MomoiTTS release ZIP'
        $picker.Filter = 'MomoiTTS ZIP (*.zip)|*.zip'
        if ($picker.ShowDialog() -ne 'OK') { exit 0 }
        $ArchivePath = $picker.FileName
    }
    if (-not $NoDialog) {
        Add-Type -AssemblyName System.Windows.Forms
        $progressForm = New-Object System.Windows.Forms.Form
        $progressForm.Text = 'Updating MomoiTTS'
        $progressForm.Width = 440; $progressForm.Height = 140
        $progressForm.StartPosition = 'CenterScreen'; $progressForm.ControlBox = $false
        $progressLabel = New-Object System.Windows.Forms.Label
        $progressLabel.Text = 'Checking the downloaded release...'
        $progressLabel.AutoSize = $false; $progressLabel.Width = 400; $progressLabel.Height = 35
        $progressLabel.Left = 15; $progressLabel.Top = 15
        $progressBar = New-Object System.Windows.Forms.ProgressBar
        $progressBar.Style = 'Marquee'; $progressBar.Width = 390
        $progressBar.Left = 15; $progressBar.Top = 55
        $progressForm.Controls.Add($progressLabel); $progressForm.Controls.Add($progressBar)
        $progressForm.Show(); [System.Windows.Forms.Application]::DoEvents()
    }
    $old = Get-Content -LiteralPath (Join-Path $target 'release.json') -Raw | ConvertFrom-Json
    if ($old.app -ne 'momoitts' -or $old.schema -ne 1) { throw 'This folder is not an installed MomoiTTS release.' }
    New-Item -ItemType Directory -Path $stage, $backup -Force | Out-Null
    $archive = [System.IO.Compression.ZipFile]::OpenRead([System.IO.Path]::GetFullPath($ArchivePath))
    try {
        if ($archive.Entries.Count -gt 10000) { throw 'Release archive is too large.' }
        $total = 0L
        $names = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
        foreach ($entry in $archive.Entries) {
            Update-Progress 'Checking and preparing the downloaded release...'
            if ($entry.FullName.EndsWith('/')) { continue }
            if (-not $entry.FullName.StartsWith('MomoiTTS/')) { throw 'Unsupported release layout.' }
            $relative = $entry.FullName.Substring(9)
            [void](Public-Path $relative)
            if (-not $names.Add($relative)) { throw 'Duplicate release path.' }
            $total += $entry.Length
            if ($total -gt 536870912) { throw 'Release archive is too large.' }
            $destination = Join-Path $stage $relative
            New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $false)
        }
    } finally { $archive.Dispose() }
    $release = Get-Content -LiteralPath (Join-Path $stage 'release.json') -Raw | ConvertFrom-Json
    if ($release.app -ne 'momoitts' -or $release.schema -ne 1) { throw 'Unsupported release manifest.' }
    $files = @($release.files.PSObject.Properties)
    if ($files.Count -lt 1 -or $names.Count -ne $files.Count + 1) { throw 'Release manifest does not match archive files.' }
    foreach ($file in $files) {
        Update-Progress 'Verifying application files...'
        [void](Public-Path $file.Name)
        if ($file.Value -notmatch '^[a-f0-9]{64}$' -or (Get-ReleaseHash (Join-Path $stage $file.Name)) -ne $file.Value) { throw 'Release integrity check failed.' }
    }
    foreach ($required in @('runtime/node.exe', 'src/app/main.js', 'scripts/windows/launch.ps1', 'scripts/launch/update-target.js', 'Launch MomoiTTS.cmd')) {
        if (-not $names.Contains($required)) { throw 'Required application files are missing.' }
    }
    Update-Progress 'Closing MomoiTTS before updating...'
    $probe = & (Join-Path $target 'runtime/node.exe') (Join-Path $target 'scripts/launch/update-target.js')
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify the current app configuration.' }
    $managed = @($old.files.PSObject.Properties.Name) + @($files.Name) + @('release.json') | Select-Object -Unique
    foreach ($relative in $managed) {
        Update-Progress 'Preparing recovery copies. Private data stays in place...'
        $destination = Public-Path $relative
        if (Test-Path -LiteralPath $destination) {
            $saved = Join-Path $backup $relative
            New-Item -ItemType Directory -Path (Split-Path -Parent $saved) -Force | Out-Null
            Copy-Item -LiteralPath $destination -Destination $saved
        }
    }
    foreach ($relative in $managed) {
        Update-Progress 'Installing the update...'
        $destination = Public-Path $relative
        $changed += $relative
        $replacement = Join-Path $stage $relative
        if (Test-Path -LiteralPath $replacement) {
            New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
            Copy-Item -LiteralPath $replacement -Destination $destination -Force
        } elseif (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
    }
    $installed = $true
    if ($progressForm) { $progressForm.Close() }
    if (-not $NoDialog) {
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show('MomoiTTS updated. Your private settings and pending refunds were preserved. Use Launch MomoiTTS to reopen it.', 'Update complete', 'OK', 'Information') | Out-Null
    }
} catch {
    Update-Progress 'Restoring previous application files...'
    if (-not $installed) {
        foreach ($relative in $changed) {
            try {
            $destination = Public-Path $relative
            $saved = Join-Path $backup $relative
            if (Test-Path -LiteralPath $saved) { Copy-Item -LiteralPath $saved -Destination $destination -Force }
            elseif (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
            } catch { $rollbackFailed = $true }
        }
    }
    if ($NoDialog) { throw }
    if ($progressForm) { $progressForm.Close() }
    Add-Type -AssemblyName PresentationFramework
    $failureMessage = if ($rollbackFailed) { 'Update failed and restoration was incomplete. Private data was kept. Leave the update workspace in place for recovery and ask the maintainer for help.' } else { 'Update failed. Previous app files and private data were retained. Check the downloaded release and retry.' }
    [System.Windows.MessageBox]::Show($failureMessage, 'Update failed', 'OK', 'Error') | Out-Null
    exit 1
} finally {
    if ($progressForm) { $progressForm.Dispose() }
    if (-not $rollbackFailed -and (Test-Path -LiteralPath $work)) {
        $resolved = [System.IO.Path]::GetFullPath($work)
        if (-not [System.StringComparer]::OrdinalIgnoreCase.Equals((Split-Path -Parent $resolved), $target) -or (Split-Path -Leaf $resolved) -notmatch '^\.update-work-[a-f0-9]{32}$') { throw 'Unsafe update cleanup path.' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
