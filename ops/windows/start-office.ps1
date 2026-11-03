# Compound Chronicle HQ — one-click start on Windows (no Ubuntu, no terminal).
#   -Mode view : watch the office
#   -Mode boss : walk in as the Boss
# Starts what is not running yet (FreeLLM, the office service), then opens the Godot client.
# Paths come from %USERPROFILE%\.config\office\launch.json (written by install-desktop.ps1).
param([ValidateSet('view', 'boss')][string]$Mode = 'view')
$ErrorActionPreference = 'Stop'
$cfgPath = Join-Path $env:USERPROFILE '.config\office\launch.json'
$log = Join-Path $env:USERPROFILE '.config\office\launcher.log'
function Say($m) { Add-Content -Path $log -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $m) }   # local time (the u format adds a false Z)
function Fail($m) { Say "ERROR $m"; Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show($m, 'Office') | Out-Null; exit 1 }
function PortOpen($port) { try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $port); $c.Close(); $true } catch { $false } }
# the window is hidden: any unexpected error must reach the log and the Boss, not vanish
trap { Fail "Kutilmagan xato: $_" }

if (-not (Test-Path $cfgPath)) { Fail "launch.json topilmadi: $cfgPath. install-desktop.ps1 ni bir marta ishga tushiring." }
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
$repo = $cfg.repo
# portable Node (not on PATH) — the launcher brings its own
if ($cfg.node_dir) { $env:PATH = "$($cfg.node_dir);$env:PATH" }
# the minds' model endpoint: local FreeLLM (default) or a provider directly (e.g. https://api.groq.com/openai)
$llmUrl = if ($cfg.llm_url) { $cfg.llm_url } else { 'http://127.0.0.1:3001' }
$keyFile = if ($cfg.llm_key_file) { $cfg.llm_key_file } else { $cfg.freellm_key_file }

# 1) FreeLLM (the staff's minds) on 127.0.0.1:3001
if ($llmUrl -like '*127.0.0.1:3001*' -and -not (PortOpen 3001)) {
  if ($cfg.freellm_start) {
    Say "starting FreeLLM"
    Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList '/c', $cfg.freellm_start -WorkingDirectory $cfg.freellm_dir
    for ($i = 0; $i -lt 60 -and -not (PortOpen 3001); $i++) { Start-Sleep -Seconds 1 }
    if (-not (PortOpen 3001)) { Say 'FreeLLM did not open port 3001 (the office still opens; staff will not talk)' }
  }
}

# 2) the office service (world + minds) on 127.0.0.1:8765 — updated from GitHub before it starts
if (-not (PortOpen 8765)) {
  Push-Location $repo
  try { git pull --ff-only --quiet 2>&1 | Out-Null; Say 'git pull ok' } catch { Say "git pull skipped: $_" }
  # node_modules installed from WSL hold Linux binaries (esbuild): Windows needs its own once
  # through cmd: in Windows PowerShell 5.1 with ErrorActionPreference=Stop, npm's stderr warnings would
  # abort this hidden script silently
  if (-not (Test-Path (Join-Path $repo 'node_modules\@esbuild\win32-x64'))) {
    Say 'npm install (Windows binaries)'
    & cmd.exe /c "npm install --no-audit --no-fund >> `"$log`" 2>&1"
    if ($LASTEXITCODE -ne 0) { Fail "npm install muvaffaqiyatsiz (log: $log)" }
  }
  Pop-Location
  $data = Join-Path $env:USERPROFILE 'office-world-data'
  New-Item -ItemType Directory -Force -Path $data | Out-Null
  $tok = Join-Path $data 'boss.token'
  if (-not (Test-Path $tok)) { -join ((48..57) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ }) | Set-Content -NoNewline $tok }
  $env:FREELLM_URL = $llmUrl
  $env:FREELLM_KEY_FILE = $keyFile
  $env:FAST_MODEL = $cfg.fast_model
  $env:STRONG_MODEL = $cfg.strong_model
  $env:LIFE_REASONING = 'low'
  # free tiers allow only a few requests a minute per model: few minds think at the same time (launch.json max_thoughts)
  $env:MAX_THOUGHTS = if ($cfg.max_thoughts) { "$($cfg.max_thoughts)" } else { '2' }
  $env:DATA_DIR = $data
  $env:BOSS_TOKEN_FILE = $tok
  $env:PORT = '8765'
  Say 'starting office service'
  Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -WorkingDirectory $repo `
    -ArgumentList '/c', "npx tsx packages\server\src\main.ts >> `"$data\office.log`" 2>&1"
  for ($i = 0; $i -lt 90 -and -not (PortOpen 8765); $i++) { Start-Sleep -Seconds 1 }
  if (-not (PortOpen 8765)) { Fail "Office xizmati ishga tushmadi. Log: $data\office.log" }
}

# 3) the 3D office
$tokFile = Join-Path $env:USERPROFILE 'office-world-data\boss.token'
$gargs = @('--path', (Join-Path $repo 'godot'), '--', '--server=ws://127.0.0.1:8765')
if ($Mode -eq 'boss') { $gargs += @('--boss', "--token-file=$tokFile") } else { $gargs += '--view' }
Say "opening Godot ($Mode)"
Start-Process -FilePath $cfg.godot -ArgumentList $gargs
