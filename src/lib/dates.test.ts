import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysUntil, relativeDays, reminderTime, tone } from './dates';
import { ftsQuery } from './query';

test('days until counts calendar days', () => {
  const now = new Date(2026, 10, 13, 23, 30);
  assert.equal(daysUntil('2026-11-13', now), 0);
  assert.equal(daysUntil('2026-11-14', now), 1);
  assert.equal(daysUntil('2026-11-01', now), -12);
  assert.equal(relativeDays(-3), '3 days ago');
  assert.equal(relativeDays(400), 'in 13 months');
  assert.equal(tone(-1), 'danger');
  assert.equal(tone(7), 'warning');
});

test('reminders are at 9:00 the chosen number of days before', () => {
  const at = reminderTime('2027-03-01', 7);
  assert.deepEqual([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours()], [2027, 1, 22, 9]);
});

test('search input cannot inject FTS syntax', () => {
  assert.equal(ftsQuery('  lesco  bill '), '"lesco"* "bill"*');
  assert.equal(ftsQuery('a" OR 1=1 --'), '"a"* "OR"* "11"*');
  assert.equal(ftsQuery('*** ()'), null);
});
