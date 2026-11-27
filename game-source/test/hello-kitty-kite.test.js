import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const textureSource = readFileSync(new URL('../src/textures.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('Hello Kitty is a named selectable kite pattern, not the starting kite', () => {
  assert.match(textureSource, /id: 'hello_kitty', name: 'Pipa da Hello Kitty 🎀'/);
  assert.match(textureSource, /function drawHelloKittyArtwork/);
  assert.match(mainSource, /patternId: 'estrela_paulista'/);
});

test('the Hello Kitty paper has the reference pink wallpaper and a complete illustrated character', () => {
  assert.match(textureSource, /drawWallpaperHead/);
  assert.match(textureSource, /Main seated character/);
  assert.match(textureSource, /drawBow\(70, -93, 0\.7, 1\)/);
});
