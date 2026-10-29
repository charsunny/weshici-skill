import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCaptionMarkdown, buildTreatmentMarkdown, audioFacts } from '../scripts/caption.mjs';

const poem = { title: '渔父', author: '苏轼', dynasty: '宋', duration: 22, procedural: { generator: 'shanshui@5', seed: 's' },
  lines: ['渔父醉，蓑衣舞。'], couplets: [{ start: 2.31, end: 4.05, text: '渔父醉，蓑衣舞。' }] };
const FALSE = /声画同步|词级|字级|Ducking|闪避/;

test('no recording: the caption and treatment never claim a reading or timing', () => {
  for (const style of ['ink-story', 'huaping-motion', 'poem-song-mv']) {
    const caption = buildCaptionMarkdown(poem, style);
    const treatment = buildTreatmentMarkdown(poem, 'yufu', style);
    assert.doesNotMatch(caption, FALSE);
    assert.doesNotMatch(treatment, FALSE);
    assert.match(caption, /无朗读/);
    assert.doesNotMatch(caption, /朗读人声/);
  }
});

test('with a recording: line timing only where the template follows it', () => {
  const voiced = { ...poem, voice: '/assets/x.mp3' };
  assert.match(buildCaptionMarkdown(voiced, 'ink-story'), /每行朗读的起始时间/);
  assert.match(buildCaptionMarkdown(voiced, 'huaping-motion'), /不跟随朗读时间/);
  for (const style of ['ink-story', 'huaping-motion']) {
    assert.doesNotMatch(buildCaptionMarkdown(voiced, style), FALSE);
    assert.doesNotMatch(buildTreatmentMarkdown(voiced, 'yufu', style), FALSE);
  }
  assert.equal(audioFacts(voiced, 'ink-story').hasVoice, true);
  assert.match(buildCaptionMarkdown(voiced, 'ink-story'), /宋 · 苏轼《渔父》/);
});
