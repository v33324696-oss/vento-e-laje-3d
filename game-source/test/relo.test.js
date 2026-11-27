import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReloScore, getCrossingQuality, closestSegments3D } from '../src/relo.js';

test('crossing quality distinguishes perpendicular lines from parallel lines', () => {
  assert.equal(getCrossingQuality([1,0,0],[1,0,0]),0);
  assert.equal(getCrossingQuality([1,0,0],[0,1,0]),1);
});
test('closest 3D segments finds a perpendicular crossing', () => {
  const r=closestSegments3D([-1,0,0],[1,0,0],[0,-1,0],[0,1,0]);
  assert.ok(r.distance<1e-8); assert.ok(Math.abs(r.s-.5)<1e-8); assert.ok(Math.abs(r.t-.5)<1e-8);
});
const base={crossingQuality:.9,tension:.70,reelSpeed:16,kiteSpeed:8,relativeSpeed:10,linePower:.9,ownU:.25,targetU:.9,wrapQuality:.9,windAlignment:.9};
test('a clean wrapped largada beats a mistimed one',()=>{
 const good=evaluateReloScore({...base,largadaActive:true,largadaQuality:.94});
 const bad=evaluateReloScore({...base,largadaActive:true,largadaQuality:.08});
 assert.ok(good>bad*1.8);
});
test('largada without wrapping is not a free critical move',()=>{
 const normal=evaluateReloScore({...base,largadaActive:false});
 const unwrapped=evaluateReloScore({...base,wrapQuality:0,largadaActive:true,largadaQuality:1});
 assert.ok(unwrapped<normal);
});
test('bad entry and weak angle are disadvantaged',()=>{
 const clean=evaluateReloScore(base);
 const wrong=evaluateReloScore({...base,ownU:.94,targetU:.2});
 const parallel=evaluateReloScore({...base,crossingQuality:.05});
 assert.ok(clean>wrong*1.6); assert.ok(clean>parallel*2);
});
