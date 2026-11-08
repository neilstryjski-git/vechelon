// W303 — reviewer sign-in gate. Runs via `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isReviewerEmail } from '../src/lib/reviewerAccess.ts';

const R = 'play-review@vechelon.ca';

test('exact reviewer email matches (case/whitespace-insensitive)', () => {
  assert.equal(isReviewerEmail(R, R), true);
  assert.equal(isReviewerEmail('  Play-Review@Vechelon.CA ', R), true);
});

test('any other email does not match', () => {
  for (const e of ['rider@vechelon.ca', 'play-review@vechelon.ca.evil.com', 'xplay-review@vechelon.ca', 'play-review@vechelon', '']) {
    assert.equal(isReviewerEmail(e, R), false, e);
  }
});

test('unset reviewer config disables the path', () => {
  assert.equal(isReviewerEmail(R, ''), false);
  assert.equal(isReviewerEmail('', ''), false);
  assert.equal(isReviewerEmail(' ', '  '), false);
});
