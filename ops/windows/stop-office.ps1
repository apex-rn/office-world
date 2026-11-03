# Stop the office service (port 8765); FreeLLM keeps running. -All also stops FreeLLM (port 3001).
param([switch]$All)
# Get-NetTCPConnection returns nothing on some Windows installs (broken NetTCPIP CIM provider): read netstat instead
function ListenerPid($port) {
  # the listening socket is the one with no remote end (0.0.0.0:0 / [::]:0); netstat here sometimes labels it
  # FIN_WAIT_1 instead of LISTENING, so the state column is not trusted
  foreach ($l in (netstat -ano)) {   # IPv4 and IPv6 (the office service listens on [::])
    if ($l -match "^\s*TCP\s+\S+:$port\s+(0\.0\.0\.0:0|\[::\]:0)\s+\S+\s+(\d+)\s*$") { return [int]$Matches[2] }
  }
  $null
}
$ports = @(8765); if ($All) { $ports += 3001 }
foreach ($port in $ports) {
  $p = ListenerPid $port
  if ($p) { Stop-Process -Id $p -Force; "stopped port $port (pid $p)" } else { "nothing listening on $port" }
}
