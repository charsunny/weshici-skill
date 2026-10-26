import test from 'node:test';
import assert from 'node:assert/strict';
import { beijingDay, huapingCalendar, huapingInvitation } from '../resources/core/huaping-footer.js';

test('date and season use the same Beijing calendar day at midnight', () => {
  assert.equal(beijingDay(new Date('2026-10-25T15:59:59Z')), '2026-10-25');
  assert.equal(beijingDay(new Date('2026-10-25T16:00:00Z')), '2026-10-26');
  assert.deepEqual(huapingCalendar('2026-10-26'), { day: '2026-10-26', dateText: '2026年10月26日', term: '霜降', hou: '初候', tag: '霜降 · 初候' });
});

test('solar-term boundary, five-day periods, year rollover and known exception match Wish', () => {
  for (const [day, tag] of [['2026-10-08','寒露 · 初候'],['2026-10-13','寒露 · 二候'],['2026-10-18','寒露 · 三候'],['2026-10-23','霜降 · 初候'],['2026-01-01','冬至 · 三候'],['2026-02-18','雨水 · 初候']]) {
    assert.equal(huapingCalendar(day).tag, tag);
  }
  for (const day of ['2026-02-30','2026-13-01','1999-10-26','oops']) assert.throws(() => huapingCalendar(day));
});

test('QR lookup retains the actual title and author, including URL metacharacters', () => {
  const url = new URL(huapingInvitation('山居秋暝 & 秋', '王维'));
  assert.equal(url.protocol, 'weshici:');
  assert.equal(url.pathname, '/lookup');
  assert.equal(url.searchParams.get('title'), '山居秋暝 & 秋');
  assert.equal(url.searchParams.get('author'), '王维');
});
