#!/usr/bin/env node
// Import the App's original painting fonts and notices into a local, gitignored cache.
// node scripts/theme-art-fonts.mjs /path/to/wish/fonts
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { STUDY_FONTS } from '../resources/core/theme-art-study.js';
import { STUDIO_ROOT } from './server-util.mjs';
const source = process.argv[2];
if (!source) throw new Error('请提供 App 的 fonts 目录');
const notices = ['Liyu', 'Dongfang', 'Xuanzong', 'Chongxi', 'Yufan', 'Liujiang'];
for (const [i, font] of Object.values(STUDY_FONTS).slice(1).entries()) {
  const name = path.basename(font.path), directory = i < 2 ? 'PaintingFonts' : 'painting-download';
  const data = fs.readFileSync(path.join(source, directory, name));
  const license = fs.readFileSync(path.join(source, 'PaintingFonts', `${notices[i]}-LICENSE.txt`));
  const destination = path.join(STUDIO_ROOT, font.path);
  fs.mkdirSync(path.dirname(destination), { recursive:true });
  fs.writeFileSync(destination, data);
  fs.writeFileSync(destination + '.LICENSE.txt', license);
  console.log(`${font.name} · ${createHash('sha256').update(data).digest('hex')}`);
}
