param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$prebuilt = Test-Path -LiteralPath (Join-Path $projectRoot 'src/app/main.js')
$dependencyFile = if ($prebuilt) { 'node_modules/@twurple/eventsub-ws/package.json' } else { 'node_modules/vite/package.json' }
try {
    $bundledNode = Join-Path $projectRoot 'runtime/node.exe'
    $nodeCommand = if (Test-Path -LiteralPath $bundledNode) { Get-Item -LiteralPath $bundledNode } else { Get-Command node -ErrorAction SilentlyContinue }
    $nodePath = if ($nodeCommand -is [System.IO.FileInfo]) { $nodeCommand.FullName } else { $nodeCommand.Source }
    $readyNode = $false
    if ($nodeCommand) {
        $nodeVersion = & $nodePath -p 'process.versions.node'
        $readyNode = $LASTEXITCODE -eq 0 -and [version]$nodeVersion -ge [version]'24.12.0'
    }
    if (-not $readyNode -or -not (Test-Path -LiteralPath (Join-Path $projectRoot $dependencyFile))) {
        throw 'The app runtime or dependencies are missing. Re-extract the complete release. For source development, follow the repository build instructions.'
    }
    $privateRoot = Join-Path $projectRoot '.local'
    New-Item -ItemType Directory -Path $privateRoot -Force | Out-Null
    $logPath = Join-Path $privateRoot 'launcher.log'
    $errorPath = Join-Path $privateRoot 'launcher-error.log'
    $entry = if ($prebuilt) { 'scripts/launch/launch.js' } else { 'scripts/launch/launch.ts' }
    $nodeArgs = @($entry)
    if ($NoOpen) { $nodeArgs += '--no-open' }
    $launcherProcess = Start-Process -FilePath $nodePath -ArgumentList $nodeArgs -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError $errorPath -PassThru
    # Retain the handle before a fast exit so ExitCode remains available.
    $launcherHandle = $launcherProcess.Handle
    # Start-Process -Wait includes descendants, including the background app.
    # Wait only for the readiness/opening helper, which exits once startup succeeds.
    # The finite overload also avoids waiting for inherited redirected streams.
    if (-not $launcherProcess.WaitForExit(600000)) {
        $launcherProcess.Kill()
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show('Startup timed out. Check the private launcher logs before retrying. Re-extract the complete release if app files are missing.', 'MomoiTTS could not start', 'OK', 'Error') | Out-Null
        exit 1
    }
    $launcherProcess.Refresh()
    if ($launcherProcess.ExitCode -ne 0) {
        $detail = Get-Content -LiteralPath $errorPath -Raw
        if (-not $detail) { $detail = 'Startup failed. Check the private launcher logs or re-extract the complete release.' }
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show($detail, 'MomoiTTS could not start', 'OK', 'Error') | Out-Null
        exit 1
    }
} catch {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('MomoiTTS could not launch. Check that its folder is complete and writable. Re-extract the release or follow the source development instructions.', 'MomoiTTS could not start', 'OK', 'Error') | Out-Null
    exit 1
}
