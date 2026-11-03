# Stop the office: the office service (Windows or the old one inside WSL) and the 3D window. FreeLLM keeps running.
# Shows what it stopped in a message box (the desktop office-stop.bat runs this without a console);
# -Quiet prints it instead (scripts and tests: a message box would wait for a click forever).
param([switch]$Quiet)
$done = @()
# 1) office service started on Windows (node ... packages\server\src\main.ts)
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'packages[\\/]server[\\/]src[\\/]main\.ts' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $done += "ofis xizmati (Windows, PID $($_.ProcessId))" }
# 2) an older office service inside WSL (WSL forwards its port 8765, so Windows sees no PID)
if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
  $r = wsl.exe -e bash -lc "pkill -f 'packages/server/src/main.ts' && echo killed" 2>$null
  if ($r -match 'killed') { $done += 'ofis xizmati (WSL ichida)' }
}
# 3) the 3D window
Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'Godot*' } |
  ForEach-Object { Stop-Process -Id $_.Id -Force; $done += "3D oyna (Godot, PID $($_.Id))" }
Start-Sleep -Seconds 2
$still = try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', 8765); $c.Close(); $true } catch { $false }
$msg = if ($done.Count) { "To'xtatildi:`n- " + ($done -join "`n- ") } else { "Hech narsa ishlamayotgan edi." }
if ($still) { $msg += "`n`nDIQQAT: 8765-port hali band. Kompyuterni qayta yoqing yoki 'wsl --shutdown' bajaring." }
if ($Quiet) { $msg } else { Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show($msg, 'Office — stop') | Out-Null }
