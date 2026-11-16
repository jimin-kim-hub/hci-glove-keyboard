// calibrun.test.js — v1.1 calibration tap acceptance (보정 탭 수용 규칙)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibTapAccepted } from '../js/calibrun.js';
import { KEY_BY_ID } from '../js/geometry.js';

const center = id => ({ x: KEY_BY_ID[id].cx, y: KEY_BY_ID[id].cy });

test('tap on or next to the highlighted key is accepted', () => {
  assert.equal(calibTapAccepted(center('w'), 'w'), true);
  assert.equal(calibTapAccepted(center('e'), 'w'), true);  // neighbor-key slip is real calibration data
  assert.equal(calibTapAccepted(center('s'), 'w'), true);
});

test('tap two or more keys away from the highlighted key is ignored', () => {
  assert.equal(calibTapAccepted(center('r'), 'w'), false); // e.g. typing ahead / missed glove tap
  assert.equal(calibTapAccepted(center('a'), 'l'), false);  // P01 v1.0 case: l highlighted, a pressed
  assert.equal(calibTapAccepted(center('space'), 'e'), false);
});

test('space target accepts taps on the space bar', () => {
  assert.equal(calibTapAccepted(center('space'), 'space'), true);
});
