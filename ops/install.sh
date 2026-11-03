#!/bin/bash
# Install or update the office service on the server (as user cc). Safe to re-run. Never touches other services.
set -euo pipefail
cd ~/office-world
git pull --ff-only
npm ci --no-audit --no-fund
npm test
mkdir -p ~/office-world-data ~/.config/systemd/user
[ -f ~/office-world-data/boss.token ] || (umask 077; head -c 24 /dev/urandom | base64 | tr -d '/+=' > ~/office-world-data/boss.token)
cp ops/office-world.service ~/.config/systemd/user/office-world.service
# if the FreeLLM fallback chains are not created yet, fall back to the free alias
if ! curl -s -m 5 -H "Authorization: Bearer $(cat ~/.config/freellmapi/unified_key)" http://127.0.0.1:3001/v1/models | grep -q 'office-strong'; then
  sed -i 's/auto:office-fast/claude-opus-4-5/; s/auto:office-strong/claude-opus-4-5/' ~/.config/systemd/user/office-world.service
fi
systemctl --user daemon-reload
systemctl --user enable --now office-world
systemctl --user --no-pager status office-world | head -5
echo "Stream: ws://127.0.0.1:8765 (tunnel from the PC: ssh -L 8765:127.0.0.1:8765 cc@<server>)"
