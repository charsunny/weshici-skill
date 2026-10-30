/**
 * 微诗诗库查询 (poem-lookup.mjs)
 *
 * 社媒文案里的朝代、题解只能来自诗库或用户显式传入，查不到就省略，不用固定文案顶替。
 * 公开接口：GET https://www.weshici.com/api/v1/poems/search?q=<诗题>（匿名可用）。
 */

export const WEISHI_API_BASE = process.env.WEISHI_API_BASE || 'https://www.weshici.com/api/v1';

// Same labels as Wish web/lib/dynasty.ts.
const DYNASTY_LABELS = {
  pre_qin: '先秦', han: '汉', wei_jin: '魏晋', southern_northern: '南北朝',
  tang: '唐', song: '宋', yuan: '元', ming: '明', qing: '清', modern: '近现代',
};

export function formatDynasty(value) {
  if (!value) return '';
  return DYNASTY_LABELS[value] ?? value;
}

const clean = value => String(value || '').replace(/[\p{P}\p{Z}\s]/gu, '');

/**
 * 只认诗题完全一致、作者一致（给了作者时）的那一首。没给作者时不猜：
 * 同名多首必须靠诗句对上；给了诗句却对不上原文，也不认。
 */
export function pickPoem(items, { title, author, poem } = {}) {
  const wanted = clean(title);
  const matches = (items || []).filter(item => clean(item.title) === wanted
    && (!author || clean(item.author?.name) === clean(author)));
  const excerpt = clean(String(poem || '').split(/[，。？！；\n]/)[0]);
  const byText = excerpt && matches.find(item => clean(item.content || (item.paragraphs || []).join('')).includes(excerpt));
  if (byText) return byText;
  if (author) return matches[0] || null;
  return matches.length === 1 && !excerpt ? matches[0] : null;
}

export async function lookupPoem({ title, author, poem }, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (!title) return null;
  try {
    const url = `${WEISHI_API_BASE}/poems/search?q=${encodeURIComponent(title)}&limit=40`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = await res.json();
    const items = Array.isArray(body?.data) ? body.data : [];
    return pickPoem(items, { title, author, poem });
  } catch {
    return null;
  }
}

/** 从诗库条目取可展示的事实：朝代与题解（summary）。缺字段就是空串。 */
export function poemFacts(entry) {
  if (!entry) return { dynasty: '', note: '', id: '' };
  return {
    id: entry.id || '',
    dynasty: formatDynasty(entry.dynasty || entry.author?.dynasty),
    note: String(entry.summary || '').trim(),
  };
}

/** 「宋 · 苏轼」；朝代未知时只写作者。 */
export function byline(dynasty, author, separator = ' · ') {
  return [dynasty, author].filter(Boolean).join(separator);
}
