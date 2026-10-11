param(
    [ValidateSet('Bootstrap', 'Check', 'Install')]
    [string]$Action = 'Bootstrap',
    [switch]$NoOpen
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath $projectRoot
$prebuilt = Test-Path -LiteralPath (Join-Path $projectRoot 'src/app/main.js')
$dependencyFile = if ($prebuilt) { 'node_modules/@twurple/eventsub-ws/package.json' } else { 'node_modules/vite/package.json' }
function Ask([string]$Text) {
    Add-Type -AssemblyName PresentationFramework
    return [System.Windows.MessageBox]::Show($Text, 'Prepare this PC', 'YesNo', 'Question') -eq 'Yes'
}
function Require-Node {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw 'Node.js 24.12 or newer is required. Reopen the launcher after installation.' }
    $version = & $node.Source -p 'process.versions.node'
    if ($LASTEXITCODE -ne 0 -or [version]$version -lt [version]'24.12.0') { throw 'Node.js 24.12 or newer is required. Reopen the launcher after installation.' }
}
function Run-Npm([string[]]$Arguments) {
    Require-Node
    $npm = Get-Command npm.cmd -ErrorAction Stop
    & $npm.Source @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'The setup action failed. Check internet access and supported software, then retry.' }
}
function Install-App {
    if ($prebuilt) {
        Run-Npm @('ci', '--omit=dev', '--ignore-scripts')
        return
    }
    Run-Npm @('ci')
    Run-Npm @('run', 'build')
}
function Prepare-PC {
    try { Require-Node } catch {
        $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
        if ($winget) {
            if (-not (Ask 'Node.js is missing or too old. Install/update the official Node.js LTS package using Windows Package Manager? This requires internet and may request administrator approval.')) { return $false }
            & $winget.Source install --id OpenJS.NodeJS.LTS --exact --source winget --accept-source-agreements --accept-package-agreements | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'Node installation did not complete. Use the official Node.js download and reopen setup.' }
        } else {
            if (Ask 'Node.js is missing or too old. Windows Package Manager is unavailable. Open the official Node.js download page so you can install it?') { Start-Process -FilePath 'https://nodejs.org/en/download' }
        }
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show('After installing Node.js, reopen this shortcut to finish preparing the app.', 'Prepare this PC', 'OK', 'Information') | Out-Null
        return $false
    }
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $dependencyFile))) {
        $description = if ($prebuilt) { 'App dependencies are missing. Download the pinned runtime dependencies? This requires internet; it does not contact generation, speech, or Twitch services.' } else { 'Development dependencies are missing. Download the pinned dependencies and build the browser interface? This requires internet; it does not contact generation, speech, or Twitch services.' }
        if (-not (Ask $description)) { return $false }
        Install-App | Out-Null
    }
    return $true
}
try {
    switch ($Action) {
        'Bootstrap' {
            if (-not (Prepare-PC)) { exit 1 }
            $launchArguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + (Join-Path $PSScriptRoot 'launch.ps1') + '"'))
            if ($NoOpen) { $launchArguments += '-NoOpen' }
            Start-Process -FilePath 'powershell.exe' -ArgumentList $launchArguments -WorkingDirectory $projectRoot -WindowStyle Hidden
        }
        'Check' { Require-Node; if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $dependencyFile))) { throw 'App dependencies are missing.' } }
        'Install' { Install-App }
    }
} catch {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($_.Exception.Message, 'Setup action failed', 'OK', 'Error') | Out-Null
    exit 1
}
