param(
    [ValidateSet('Wizard', 'Check', 'Install', 'Demo', 'EditTwitch', 'LoginTwitch', 'Reward', 'InstallCodex', 'LoginCodex', 'EditFish')]
    [string]$Action = 'Wizard',
    [switch]$KeepOpen
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$setupScript = Join-Path $PSScriptRoot 'setup.ps1'
Set-Location -LiteralPath $projectRoot

function Require-Node {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw 'Install Node.js 24.12 or newer from https://nodejs.org/en/download, then reopen Setup Tyrone.' }
    $version = & $node.Source -p 'process.versions.node'
    if ($LASTEXITCODE -ne 0 -or [version]$version -lt [version]'24.12.0') { throw 'Node.js 24.12 or newer is required. Update Node.js, then reopen Setup Tyrone.' }
}
function Run-Npm([string[]]$Arguments) {
    Require-Node
    $npm = Get-Command npm.cmd -ErrorAction Stop
    & $npm.Source @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'The command failed. Check the output above before continuing.' }
}
function Install-App {
    Run-Npm @('ci')
    Run-Npm @('run', 'build')
    Write-Host 'App dependencies and browser build are ready. Try the demo next.'
}
function Check-App {
    Require-Node
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules/vite/package.json'))) { throw 'App dependencies are missing. Choose Install app dependencies first.' }
    Write-Host 'Node.js and app dependencies are present. This does not check accounts or live services.'
}
function Edit-Private([string]$Name, [string]$Template) {
    $privateRoot = Join-Path $projectRoot '.local'
    New-Item -ItemType Directory -Path $privateRoot -Force | Out-Null
    $target = Join-Path $privateRoot $Name
    if (-not (Test-Path -LiteralPath $target)) { Copy-Item -LiteralPath (Join-Path $projectRoot $Template) -Destination $target }
    Write-Host 'Save your settings in Notepad, then close it. Existing settings are preserved.'
    Write-Host 'Quit Tyrone and launch it again after changing settings.'
    Start-Process -FilePath notepad.exe -ArgumentList ('"' + $target + '"') -Wait
}
function Codex-Command {
    $codex = Get-Command codex.cmd -ErrorAction SilentlyContinue
    if (-not $codex) { throw 'Return to the Prepare generation step to install the tested Codex CLI first.' }
    $version = & $codex.Source --version
    if ($LASTEXITCODE -ne 0 -or "$version".Trim() -ne 'codex-cli 0.162.0') { throw 'Tyrone requires Codex CLI 0.162.0. Return to Prepare generation; do not upgrade without rechecking the dialogue tool boundary.' }
    return $codex.Source
}

function Show-Wizard {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [System.Windows.Forms.Application]::EnableVisualStyles()
    $steps = @(
        @{ Title = 'Prepare this PC'; Button = 'Install app dependencies'; Action = 'Install'; Text = "Start on the streamer's Windows PC. You can try the demo on your PC too.`r`n`r`nInstall Node.js 24.12 or newer from nodejs.org/en/download, then reopen this setup window. The button below installs Tyrone's dependencies and builds its browser controls. Internet is required.`r`n`r`nAlready installed? Continue to Try the demo." },
        @{ Title = 'Try the demo'; Button = 'Open demo'; Action = 'Demo'; Text = "Open the demo. Playback and controls share one browser page. Enable audio there if asked.`r`n`r`nKeep the controls open and open /testing on the same local address in another tab. Send a test question as Name: question, for example Tyrone: How do I improve? Missing or unknown names are rejected. You should hear a short tone and see a simulated reply. Try Pause, Resume, and Skip.`r`n`r`nThe demo needs no provider accounts. You can finish here and connect accounts later." },
        @{ Title = 'Configure Twitch'; Button = 'Edit Twitch settings'; Action = 'EditTwitch'; Text = "Do this with the broadcaster on their PC.`r`n`r`nRegister a Public Twitch app at dev.twitch.tv/console/apps with your helper. Then use the button below to open the private settings file in Notepad.`r`n`r`nReplace TWITCH_CLIENT_ID with that app's client ID and TWITCH_CHANNEL with the broadcaster's login. Save and close Notepad. No client secret is needed." },
        @{ Title = 'Authorize the broadcaster'; Button = 'Sign in to Twitch'; Action = 'LoginTwitch'; Text = "The next button opens a sign-in window showing Twitch's activation link and code.`r`n`r`nThe channel owner opens that link and authorizes reward management using their broadcaster account. Moderator access alone is insufficient.`r`n`r`nAfter sign-in finishes, close the sign-in window to return here. Authorization stays on this PC." },
        @{ Title = 'Create the reward and test Twitch'; Button = 'Create or check reward'; Action = 'Reward'; Confirm = 'This can create Ask Tyrone on the configured channel: initially 1000 points and a 60-second global cooldown. Create or check this reward now?'; Text = "The app needs one shared required-text reward to complete or refund redemptions. A manually created reward cannot substitute. Existing reward settings are preserved.`r`n`r`nAfter creating it, quit and reopen the demo. Click Connect Twitch. Viewers type Name: question. Check completion and refunds for missing/unknown names, Skip, and moderator rejection.`r`n`r`nCompleted demo redemptions consume channel points. Check pending outcomes resolve before moving to live replies." },
        @{ Title = 'Prepare generation'; Button = 'Install generation CLI'; Action = 'InstallCodex'; Confirm = 'Install official Codex CLI 0.162.0 globally for this Windows user? This may replace an existing Codex version.'; Text = "This step is for Codex generation. If using OpenRouter, skip this step and the next sign-in step; configure .local/generation.env with your helper using docs/streamer-setup.md.`r`n`r`nThe button installs version 0.162.0, which Tyrone's dialogue-only adapter was tested with. Do not upgrade it independently.`r`n`r`nIf that exact version is already installed, continue to sign-in. This installation does not generate replies." },
        @{ Title = 'Sign in for generation'; Button = 'Sign in with ChatGPT'; Action = 'LoginCodex'; Text = "Complete the browser sign-in using the streamer's own ChatGPT account.`r`n`r`nClose the sign-in window when finished. Account eligibility, model access, and available allowance still need checking; a subscription does not mean unlimited use.`r`n`r`nNo dialogue request is sent by this setup step." },
        @{ Title = 'Add speech and the final voice'; Button = 'Edit speech settings'; Action = 'EditFish'; Text = "Each personality has an assigned voice. Final voice selection can wait. Select voices on Fish's website and copy their 32-character IDs.`r`n`r`nEnter the streamer's own FISH_API_KEY and Tyrone's FISH_VOICE_ID in private settings. Other profiles in characters/catalog.json name their own voice variables; see docs/streamer-setup.md. Every character needs a valid voice for live startup. Existing settings are preserved.`r`n`r`nCheck Fish availability, allowance, and commercial terms before live speech." },
        @{ Title = 'Ready for a live check'; Button = ''; Action = ''; Text = "Navigating these steps does not verify the accounts or services. Finish any skipped steps before testing live replies.`r`n`r`nQuit the demo, then double-click Launch Tyrone.cmd. Keep the browser page open, enable audio if asked, open /testing in another tab to send one manual question, then test a redemption. These submissions use provider allowance.`r`n`r`nFor daily use, launch Tyrone and connect Twitch. OBS setup will be handled separately. You can revisit these steps whenever needed." }
    )
    $script:setupStep = 0
    $progressPath = Join-Path $projectRoot '.local/setup-step.txt'
    if (Test-Path -LiteralPath $progressPath) {
        $savedStep = 0
        if ([int]::TryParse((Get-Content -LiteralPath $progressPath -Raw).Trim(), [ref]$savedStep) -and $savedStep -ge 0 -and $savedStep -lt $steps.Count) { $script:setupStep = $savedStep }
    }
    $script:setupChild = $null
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Tyrone setup'
    $form.ClientSize = New-Object System.Drawing.Size(660, 540)
    $form.MinimumSize = New-Object System.Drawing.Size(676, 579)
    $form.StartPosition = 'CenterScreen'
    $form.Font = New-Object System.Drawing.Font('Segoe UI', 10)
    $form.AutoScaleMode = 'Font'
    $layout = New-Object System.Windows.Forms.TableLayoutPanel
    $layout.Dock = 'Fill'; $layout.Padding = New-Object System.Windows.Forms.Padding(28)
    $layout.ColumnCount = 1; $layout.RowCount = 6
    foreach ($height in @(28, 52, 0, 52, 52, 48)) {
        $style = New-Object System.Windows.Forms.RowStyle
        if ($height -eq 0) { $style.SizeType = 'Percent'; $style.Height = 100 }
        else { $style.SizeType = 'Absolute'; $style.Height = $height }
        $layout.RowStyles.Add($style) | Out-Null
    }
    $form.Controls.Add($layout)
    $progress = New-Object System.Windows.Forms.Label
    $progress.Dock = 'Fill'; $progress.ForeColor = [System.Drawing.Color]::DimGray
    $title = New-Object System.Windows.Forms.Label
    $title.Dock = 'Fill'; $title.Font = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
    $body = New-Object System.Windows.Forms.Label
    $body.Dock = 'Fill'
    $run = New-Object System.Windows.Forms.Button
    $run.AutoSize = $true; $run.MinimumSize = New-Object System.Drawing.Size(220, 38)
    $status = New-Object System.Windows.Forms.Label
    $status.Dock = 'Fill'; $status.ForeColor = [System.Drawing.Color]::DimGray
    $navigation = New-Object System.Windows.Forms.FlowLayoutPanel
    $navigation.Dock = 'Fill'; $navigation.FlowDirection = 'LeftToRight'; $navigation.WrapContents = $false
    $back = New-Object System.Windows.Forms.Button
    $back.Text = 'Back'; $back.Size = New-Object System.Drawing.Size(90, 36)
    $next = New-Object System.Windows.Forms.Button
    $next.Size = New-Object System.Drawing.Size(170, 36)
    $close = New-Object System.Windows.Forms.Button
    $close.Text = 'Continue later'; $close.Size = New-Object System.Drawing.Size(140, 36)
    $navigation.Controls.AddRange(@($back, $next, $close))
    $layout.Controls.Add($progress, 0, 0); $layout.Controls.Add($title, 0, 1)
    $layout.Controls.Add($body, 0, 2); $layout.Controls.Add($run, 0, 3)
    $layout.Controls.Add($status, 0, 4); $layout.Controls.Add($navigation, 0, 5)
    $render = {
        $step = $steps[$script:setupStep]
        $progress.Text = 'SET UP TYRONE  /  STEP ' + ($script:setupStep + 1) + ' OF ' + $steps.Count
        $title.Text = $step.Title; $body.Text = $step.Text
        $run.Text = $step.Button; $run.Visible = [bool]$step.Action
        $back.Enabled = $script:setupStep -gt 0
        $next.Text = if ($script:setupStep -eq $steps.Count - 1) { 'Close setup' } else { 'Next step' }
        $status.Text = if ($step.Action) { 'Next only changes the page. Use the action button when you are ready.' } else { 'Use Back to revisit any step, or close setup when you are done.' }
        New-Item -ItemType Directory -Path (Split-Path -Parent $progressPath) -Force | Out-Null
        Set-Content -LiteralPath $progressPath -Value $script:setupStep
    }
    $back.Add_Click({ $script:setupStep--; & $render })
    $next.Add_Click({ if ($script:setupStep -eq $steps.Count - 1) { $form.Close() } else { $script:setupStep++; & $render } })
    $close.Add_Click({ $form.Close() })
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 250
    $timer.Add_Tick({
        if ($script:setupChild -and $script:setupChild.WaitForExit(0)) {
            $script:setupChild.Refresh()
            $status.Text = if ($script:setupChild.ExitCode -eq 0) { 'Action finished. Check the result, then continue when ready.' } else { 'Action did not finish successfully. Check its message, then retry this step.' }
            $script:setupChild.Dispose(); $script:setupChild = $null
            $timer.Stop(); $run.Enabled = $true; $back.Enabled = $script:setupStep -gt 0; $next.Enabled = $true; $close.Enabled = $true
        }
    })
    $run.Add_Click({
        $step = $steps[$script:setupStep]
        if ($step.Confirm -and [System.Windows.Forms.MessageBox]::Show($form, $step.Confirm, $step.Title, 'YesNo', 'Question') -ne 'Yes') { return }
        try {
            $visible = $step.Action -in @('Install', 'LoginTwitch', 'Reward', 'InstallCodex', 'LoginCodex')
            $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $setupScript + '"'), '-Action', $step.Action)
            if ($visible) { $arguments += '-KeepOpen' }
            $windowStyle = if ($visible) { 'Normal' } else { 'Hidden' }
            $script:setupChild = Start-Process -FilePath powershell.exe -WorkingDirectory $projectRoot -ArgumentList $arguments -WindowStyle $windowStyle -PassThru
            $childHandle = $script:setupChild.Handle
            $run.Enabled = $false; $back.Enabled = $false; $next.Enabled = $false; $close.Enabled = $false
            $status.Text = 'Finish the action in its window, then return here.'
            $timer.Start()
        } catch { $status.Text = 'Could not open the setup action. Please retry.' }
    })
    $form.Add_FormClosing({ if ($script:setupChild) { $_.Cancel = $true; $status.Text = 'Finish or close the action window before closing setup.' } })
    try { & $render; $form.ShowDialog() | Out-Null }
    finally { $timer.Dispose(); $form.Dispose() }
}

$exitCode = 0
try {
    switch ($Action) {
        'Wizard' { Show-Wizard }
        'Check' { Check-App }
        'Install' { Install-App }
        'Demo' { Check-App; & (Join-Path $PSScriptRoot 'launch.ps1') -Demo }
        'EditTwitch' { Edit-Private 'twitch.env' 'config/examples/twitch.env.example' }
        'LoginTwitch' { Check-App; Run-Npm @('run', 'twitch:login') }
        'Reward' { Check-App; Run-Npm @('run', 'twitch:reward') }
        'InstallCodex' { Run-Npm @('install', '-g', '@openai/codex@0.162.0') }
        'LoginCodex' {
            Require-Node
            $codexPath = Codex-Command
            & $codexPath login
            if ($LASTEXITCODE -ne 0) { throw 'Codex sign-in did not complete.' }
        }
        'EditFish' { Edit-Private 'fish.env' 'config/examples/fish.env.example' }
    }
} catch {
    $exitCode = 1
    if (-not $KeepOpen) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Tyrone setup', 'OK', 'Error') | Out-Null
    } else { Write-Host $_.Exception.Message -ForegroundColor Red }
}
if ($KeepOpen) { Read-Host 'Press Enter to close this action window and return to setup' | Out-Null }
exit $exitCode
