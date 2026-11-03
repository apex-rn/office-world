# One-time setup: writes %USERPROFILE%\.config\office\launch.json and puts office.bat + office-boss.bat on the Desktop.
# Groq directly (until FreeLLM runs locally):
#   ... -NodeDir C:\Users\MSI\apps\node -LlmUrl https://api.groq.com/openai -LlmKeyFile $env:USERPROFILE\.config\office\groq_key `
#       -FastModel openai/gpt-oss-20b -StrongModel openai/gpt-oss-120b
#   powershell -ExecutionPolicy Bypass -File ops\windows\install-desktop.ps1 -Godot "C:\...\Godot_v4.x.exe" `
#     -FreeLLMDir "C:\Users\msi\freellmapi" -FreeLLMStart "npm start" -FreeLLMKeyFile "C:\...\unified_key"
param(
  [Parameter(Mandatory)][string]$Godot,
  [string]$FreeLLMDir = '', [string]$FreeLLMStart = '', [string]$FreeLLMKeyFile = '',
  [string]$FastModel = 'auto:office-fast', [string]$StrongModel = 'auto:office-strong',
  [string]$NodeDir = '',                       # e.g. C:\Users\MSI\apps\node (portable Node not on PATH)
  [string]$LlmUrl = '', [string]$LlmKeyFile = ''   # direct provider instead of FreeLLM, e.g. https://api.groq.com/openai
)
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dir = Join-Path $env:USERPROFILE '.config\office'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
@{ repo = $repo; godot = $Godot; freellm_dir = $FreeLLMDir; freellm_start = $FreeLLMStart; freellm_key_file = $FreeLLMKeyFile;
   fast_model = $FastModel; strong_model = $StrongModel;
   node_dir = $NodeDir; llm_url = $LlmUrl; llm_key_file = $LlmKeyFile } | ConvertTo-Json | Set-Content (Join-Path $dir 'launch.json')
$desk = [Environment]::GetFolderPath('Desktop')        # also right when the Desktop lives in OneDrive
$ps = Join-Path $repo 'ops\windows\start-office.ps1'
foreach ($m in @(@{ n = 'office.bat'; mode = 'view' }, @{ n = 'office-boss.bat'; mode = 'boss' })) {
  "@echo off`r`nstart `"`" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps`" -Mode $($m.mode)`r`n" |
    Set-Content -Encoding ASCII (Join-Path $desk $m.n)
}
$stop = Join-Path $repo 'ops\windows\stop-office.ps1'
"@echo off`r`nstart `"`" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$stop`"`r`n" |
  Set-Content -Encoding ASCII (Join-Path $desk 'office-stop.bat')
Write-Host "OK: $desk\office.bat (tomosha), $desk\office-boss.bat (Boss bo'lib kirish), $desk\office-stop.bat (to'xtatish)"
