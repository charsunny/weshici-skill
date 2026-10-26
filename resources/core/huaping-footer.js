// Same 21st-century solar-term calendar as Wish SolarTerm.swift / web/lib/solar-terms.ts.
const TERMS = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];
const COEFFICIENTS = [5.4055,20.12,3.87,18.73,5.63,20.646,4.81,20.1,5.52,21.04,5.678,21.37,7.108,22.83,7.5,23.13,7.646,23.042,8.318,23.438,7.438,22.36,7.18,21.94];
const EXCEPTIONS = { '2002:立秋':1, '2008:小满':1, '2016:小暑':1, '2019:小寒':-1, '2021:冬至':-1, '2026:雨水':-1, '2082:大寒':1, '2084:春分':1, '2089:霜降':1, '2089:立冬':1 };

export function beijingDay(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

export function huapingCalendar(day = beijingDay()) {
  const [year, month, date] = day.split('-').map(Number);
  const stamp = Date.UTC(year, month - 1, date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || year < 2001 || year > 2099 || !Number.isFinite(stamp)
      || new Date(stamp).toISOString().slice(0, 10) !== day) throw new Error('画屏日期须为 2001—2099 年的有效 YYYY-MM-DD');
  // Include the previous winter solstice for early January, using the same coefficients as iOS.
  const entries = [year - 1, year].flatMap(y => TERMS.map((term, index) => {
    const n = y % 100;
    const d = Math.floor(n * .2422 + COEFFICIENTS[index]) - Math.floor((index < 4 ? n - 1 : n) / 4)
      + (EXCEPTIONS[`${y}:${term}`] || 0);
    return { term, stamp: Date.UTC(y, Math.floor(index / 2), d) };
  }));
  const current = entries.filter(entry => entry.stamp <= stamp).at(-1);
  const hou = ['初候', '二候', '三候'][Math.min(2, Math.floor((stamp - current.stamp) / 86400000 / 5))];
  return { day, dateText: `${year}年${month}月${date}日`, term: current.term, hou, tag: `${current.term} · ${hou}` };
}

export function huapingInvitation(title, author) {
  const url = new URL('weshici://poem/lookup');
  url.searchParams.set('title', title);
  url.searchParams.set('author', author);
  return url.href;
}

export function mountHuapingFooter(container, { width, height, title, author, date, sealColor }) {
  const calendar = huapingCalendar(date || beijingDay());
  const url = huapingInvitation(title, author);
  const qr = window.qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const footer = document.createElement('div');
  footer.className = 'hp-share-footer';
  // Native 1:1 / 3:4 canvases are 414pt wide; 16:9 is 640pt.
  const scale = width / (width / height > 1.3 ? 640 : 414);
  footer.style.cssText = `left:${width * .04}px;right:${width * .04}px;bottom:${width * .05}px;font-size:${13 * scale}px;--qr-side:${width * .095}px;--seal-color:${sealColor}`;
  const brand = document.createElement('div');
  brand.className = 'hp-share-brand';
  brand.textContent = '微\n诗';
  const code = document.createElement('div');
  code.className = 'hp-share-qr';
  code.dataset.url = url;
  code.innerHTML = qr.createSvgTag({ scalable: true, cellSize: 1, margin: 0 });
  code.setAttribute('aria-label', '打开此诗');
  const dates = document.createElement('div');
  dates.className = 'hp-share-calendar';
  dates.style.left = `${width * .23}px`;
  dates.style.lineHeight = `${(13 * 1.44 + 2) * scale}px`;
  const dateLine = document.createElement('div');
  dateLine.className = 'hp-share-date';
  dateLine.textContent = calendar.dateText;
  const tag = document.createElement('div');
  tag.className = 'hp-share-tag';
  tag.textContent = calendar.tag;
  dates.append(dateLine, tag);
  footer.append(brand, code, dates);
  container.appendChild(footer);
  return { ...calendar, url };
}
