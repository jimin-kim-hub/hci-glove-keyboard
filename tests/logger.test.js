import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJSONL } from '../js/logger.js';

const a = { ev: 'touch', sid: 's1', n: 1 }, b = { ev: 'sus', sid: 's1', n: 2 };

test('parseJSONL reads JSONL from iPhone (.ndjson) and Galaxy (CRLF, BOM) alike', () => {
  assert.deepEqual(parseJSONL(JSON.stringify(a) + '\n' + JSON.stringify(b) + '\n'), [a, b]);
  assert.deepEqual(parseJSONL('\uFEFF' + JSON.stringify(a) + '\r\n\r\n' + JSON.stringify(b)), [a, b]);
});

test('parseJSONL accepts a JSON array and drops non-log content', () => {
  assert.deepEqual(parseJSONL(JSON.stringify([a, { foo: 1 }, b])), [a, b]);
  assert.deepEqual(parseJSONL('pid,cond\nP01,A\n'), []);
  assert.deepEqual(parseJSONL('{"x":1}\nnot json\n' + JSON.stringify(a)), [a]);
});
