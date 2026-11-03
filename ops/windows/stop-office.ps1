# Stop the office service (port 8765); FreeLLM keeps running.
$p = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($p) { Stop-Process -Id $p.OwningProcess -Force; "office stopped" } else { "office not running" }
