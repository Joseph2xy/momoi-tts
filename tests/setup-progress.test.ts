import assert from 'node:assert/strict';
import test from 'node:test';
import {
  preparationLimit,
  readSetupPosition,
  setupLimit,
} from '../web/management/setup-progress.ts';

test('setup resumes navigation from bounded non-secret data and ignores malformed/obsolete records', () => {
  const empty = { step: 0, prepare: 0, characterId: null };
  for (const value of [null, '', '{', 'null', '{"version":0,"step":4}'])
    assert.deepEqual(readSetupPosition(value), empty);
  assert.deepEqual(
    readSetupPosition(
      JSON.stringify({ version: 1, step: 99, prepare: -1, characterId: '../private' }),
    ),
    {
      step: 4,
      prepare: 0,
      characterId: null,
    },
  );
  assert.deepEqual(
    readSetupPosition(JSON.stringify({ version: 1, step: 2, prepare: 3, characterId: 'tyrone' })),
    {
      step: 2,
      prepare: 3,
      characterId: 'tyrone',
    },
  );
});

test('saved navigation and complete fields cannot bypass fresh reply and OBS evidence', () => {
  const saved = readSetupPosition('{"version":1,"step":4,"prepare":3}');
  assert.equal(preparationLimit(true, true, true), 3);
  assert.equal(Math.min(saved.step, setupLimit(true, false, false, true)), 1);
  assert.equal(setupLimit(true, true, false, true), 2);
  assert.equal(setupLimit(true, true, true, false), 3);
  assert.equal(setupLimit(false, true, true, true), 0);
  assert.equal(setupLimit(true, true, true, true), 4);
});

test('missing saved prerequisite returns preparation to the earliest unresolved task', () => {
  assert.equal(preparationLimit(false, true, true), 0);
  assert.equal(preparationLimit(true, false, true), 1);
  assert.equal(preparationLimit(true, true, false), 2);
});
