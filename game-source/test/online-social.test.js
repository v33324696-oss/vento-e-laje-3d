import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('online chat exposes message and quick-emote client APIs', () => {
  const source = readFileSync(new URL('../src/multiplayer.js', import.meta.url), 'utf8');
  assert.match(source, /sendChat\(text\)/);
  assert.match(source, /sendEmote\(emote\)/);
});
