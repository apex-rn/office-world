// The Godot client builds the room from godot/layout.json at startup: it must always match the catalog layout,
// or the 3D office silently shows an old room (regenerate: npx tsx tools/export-godot.ts > godot/layout.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('godot/layout.json is up to date with the catalog layout', () => {
  const fresh = execFileSync(process.execPath, ['--import', 'tsx', 'tools/export-godot.ts'], { encoding: 'utf8' });
  const onDisk = readFileSync('godot/layout.json', 'utf8');
  assert.equal(onDisk.trim(), fresh.trim(), 'run: npx tsx tools/export-godot.ts > godot/layout.json');
});
