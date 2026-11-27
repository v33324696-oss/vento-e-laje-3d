import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const textureSource = readFileSync(new URL('../src/textures.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('Hello Kitty kite pattern is available and selected by default', () => {
  assert.match(textureSource, /id: 'hello_kitty', name: 'Hello Kitty 🎀'/);
  assert.match(textureSource, /pattern\.id === 'hello_kitty'/);
  assert.match(textureSource, /const whiskers = \[/);
  assert.match(mainSource, /patternId: 'hello_kitty'/);
});

test('Hello Kitty artwork is drawn as a texture without changing kite physics', () => {
  assert.match(textureSource, /Pink tissue-paper background/);
  assert.match(textureSource, /ctx\.ellipse\(cx, cy \+ 38, 11, 8/);
});
