param([switch]$Demo, [switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
try {
    $nodeCommand = Get-Command node -ErrorAction Stop
    $nodeVersion = & $nodeCommand.Source -p 'process.versions.node'
    if ([version]$nodeVersion -lt [version]'24.12.0') { throw 'Node.js 24.12 or newer is required.' }
    $privateRoot = Join-Path $projectRoot '.local'
    New-Item -ItemType Directory -Path $privateRoot -Force | Out-Null
    $logPath = Join-Path $privateRoot 'launcher.log'
    $errorPath = Join-Path $privateRoot 'launcher-error.log'
    $nodeArgs = @('--env-file-if-exists=.local/generation.env', '--env-file-if-exists=.local/fish.env', '--env-file-if-exists=.local/twitch.env', 'scripts/launch/launch.ts')
    if ($Demo) { $nodeArgs += '--demo' }
    if ($NoOpen) { $nodeArgs += '--no-open' }
    $launcherProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList $nodeArgs -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError $errorPath -PassThru
    # Retain the handle before a fast exit so ExitCode remains available.
    $launcherHandle = $launcherProcess.Handle
    # Start-Process -Wait includes descendants, including the background app.
    # Wait only for the readiness/opening helper, which exits once startup succeeds.
    # The finite overload also avoids waiting for inherited redirected streams.
    while (-not $launcherProcess.WaitForExit(250)) {}
    $launcherProcess.Refresh()
    if ($launcherProcess.ExitCode -ne 0) {
        $detail = Get-Content -LiteralPath $errorPath -Raw
        if (-not $detail) { $detail = 'Startup failed. Run npm start in the project folder for details.' }
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show($detail, 'Tyrone could not start', 'OK', 'Error') | Out-Null
        exit 1
    }
} catch {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('Tyrone could not launch. Install Node.js 24.12 or newer, run npm ci in the project folder, then try again.', 'Tyrone could not start', 'OK', 'Error') | Out-Null
    exit 1
}
