import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPoem, lookupPoem, poemFacts, formatDynasty, byline } from '../scripts/poem-lookup.mjs';

const poem = (title, author, dynasty, content, summary = '') => ({ title, dynasty, content, summary, author: { name: author, dynasty } });
const shuidiao = [
  poem('水调歌头', '苏轼', 'song', '明月几时有？把酒问青天。'),
  poem('水调歌头', '黄庭坚', 'song', '瑶草一何碧，春入武陵溪。'),
];

test('same-title poems are told apart by author or by the verse, never by popularity', () => {
  assert.equal(pickPoem(shuidiao, { title: '水调歌头', author: '黄庭坚' }).author.name, '黄庭坚');
  assert.equal(pickPoem(shuidiao, { title: '水调歌头', poem: '明月几时有，把酒问青天' }).author.name, '苏轼');
  assert.equal(pickPoem(shuidiao, { title: '水调歌头' }), null);
});

test('a single title match is not adopted when the given verse is not in it', () => {
  const items = [poem('江雪', '柳宗元', 'tang', '千山鸟飞绝，万径人踪灭。')];
  assert.equal(pickPoem(items, { title: '江雪' }).author.name, '柳宗元');
  assert.equal(pickPoem(items, { title: '江雪', poem: '千山鸟飞绝，万径人踪灭。' }).author.name, '柳宗元');
  assert.equal(pickPoem(items, { title: '江雪', poem: '孤村落日残霞' }), null);
  assert.equal(pickPoem(items, { title: '江雪', author: '王维' }), null);
});

test('facts come only from the entry: dynasty labels follow Wish, missing summary stays empty', () => {
  assert.deepEqual(poemFacts(poem('渔父', '苏轼', 'song', '渔父醉，蓑衣舞。')), { id: '', dynasty: '宋', note: '' });
  assert.deepEqual(poemFacts(null), { dynasty: '', note: '', id: '' });
  assert.equal(formatDynasty('tang'), '唐');
  assert.equal(formatDynasty(''), '');
  assert.equal(byline('', '苏轼'), '苏轼');
  assert.equal(byline('宋', '苏轼', '·'), '宋·苏轼');
});

test('lookup failures return null instead of a stand-in poem', async () => {
  const ok = async () => ({ ok: true, json: async () => ({ data: shuidiao }) });
  assert.equal((await lookupPoem({ title: '水调歌头', author: '苏轼' }, { fetchImpl: ok })).author.name, '苏轼');
  assert.equal(await lookupPoem({ title: '水调歌头' }, { fetchImpl: async () => ({ ok: false }) }), null);
  assert.equal(await lookupPoem({ title: '水调歌头' }, { fetchImpl: async () => { throw new Error('offline'); } }), null);
  assert.equal(await lookupPoem({ title: '' }, { fetchImpl: ok }), null);
});
