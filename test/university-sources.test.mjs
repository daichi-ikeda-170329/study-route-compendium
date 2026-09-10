/**
 * 大学別ページの出典（build/data/university-sources.json）の検査（仕様書 3.2）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const { validateUniversitySources, loadUniversitySources } = await import('../build/lib/university-sources.mjs');

const slugs = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'build/data/university-slugs.json'), 'utf8')).universities.map(u => u.slug));
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/data/university-sources.json'), 'utf8'));

test('台帳の形が正しく、slug がすべて実在する', () => {
  assert.deepEqual(validateUniversitySources(raw, slugs), []);
});

test('url が欠けると落ちる（check-data が止める）', () => {
  const broken = structuredClone(raw);
  delete broken.universities.waseda.url;
  assert.ok(validateUniversitySources(broken, slugs).some(p => /waseda\.url/.test(p)));
  const unknown = structuredClone(raw);
  unknown.universities['no-such-univ'] = { year: 2027, checked: '2026-09-10', url: 'https://example.com/' };
  assert.ok(validateUniversitySources(unknown, slugs).some(p => /no-such-univ/.test(p)));
});

test('早稲田のページに出典行と学部×方式の表が出る', () => {
  const html = fs.readFileSync(path.join(ROOT, 'univ/waseda/index.html'), 'utf8');
  const src = loadUniversitySources().waseda;
  assert.match(html, /<p class="usource">出典: 早稲田大学の\d{4}年度入試の公表資料/);
  assert.ok(html.includes(`href="${src.url}"`), '公式サイトへのリンクが無い');
  assert.match(html, /<table class="ufac">/);
  for (const f of src.faculties) assert.ok(html.includes(`<th scope="row">${f.name}</th>`), `${f.name} の行が無い`);
});

test('出典を登録していない大学は、年度を書かず確認を促す文だけを出す', () => {
  const src = loadUniversitySources();
  const dir = fs.readdirSync(path.join(ROOT, 'univ')).find(s => slugs.has(s) && !src[s]);
  assert.ok(dir, '出典未登録の大学が見つからない');
  const html = fs.readFileSync(path.join(ROOT, 'univ', dir, 'index.html'), 'utf8');
  assert.match(html, /<p class="usource">出題形式は年度により変わります。出願前に募集要項で確認してください。<\/p>/);
  assert.doesNotMatch(html, /class="ufac"/);
});

test('大学別ページの og:image は大学ごとの画像を指し、ファイルが実在する（仕様書 3.3）', () => {
  for (const slug of ['waseda', 'fun', 'todai']) {
    const html = fs.readFileSync(path.join(ROOT, 'univ', slug, 'index.html'), 'utf8');
    assert.ok(html.includes(`<meta property="og:image" content="https://route-taizen.com/assets/ogp/univ/${slug}.png">`), `${slug}: og:image が大学の画像でない`);
  }
  // 画像はコミットしない（CI で作る。仕様書 5.2）ので、実在はハッシュ台帳で確かめる
  const hashes = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/data/ogp-hashes.json'), 'utf8')).files;
  for (const slug of ['waseda', 'fun', 'todai']) assert.ok(hashes[`assets/ogp/univ/${slug}.png`], `${slug}: 台帳に無い`);
  assert.equal(Object.keys(hashes).filter(k => k.startsWith('assets/ogp/univ/')).length, slugs.size, '台帳の大学数と画像の数が合わない');
});

/* ---------- 学部別ページ（仕様書 4.5） ---------- */

const { facultyGroups, facultyVerdict, renderFacultyPage, FACULTY_MIN_UNIQUE } = await import('../build/lib/faculty-pages.mjs');
const { loadSubjectData } = await import('../build/lib/load-subject-data.mjs');

test('学部別ページは固有テキストが 300 字以上の学部だけ作り、足りない学部はページを持たない', () => {
  const src = loadUniversitySources();
  for (const u of ['waseda', 'keio', 'sophia']) {
    for (const g of facultyGroups(src[u])) {
      const exists = fs.existsSync(path.join(ROOT, 'univ', u, g.slug, 'index.html'));
      assert.equal(exists, facultyVerdict(g).ok, `${u}/${g.slug}: 判定とページの有無が合わない`);
    }
  }
});

test('同じ学部の別方式は 1 つにまとめ、固有テキストが足りれば学部別ページを描ける', () => {
  const g = {
    slug: 'test', name: 'テスト学部', focus: { english: ['超長文'] },
    rows: [{ name: 'テスト学部', method: '一般選抜', subjects: '外国語・国語', note: 'あ'.repeat(FACULTY_MIN_UNIQUE) }],
  };
  assert.equal(facultyVerdict(g).ok, true);
  assert.equal(facultyVerdict({ ...g, rows: [{ ...g.rows[0], note: '短い' }] }).ok, false);
  const html = renderFacultyPage({
    uni: { slug: 'waseda', name: '早稲田大学' }, group: g, src: loadUniversitySources().waseda,
    subjects: { english: loadSubjectData(ROOT, 'english') }, counts: {},
  });
  assert.match(html, /<h1 class="sec"[^>]*>早稲田大学 テスト学部<\/h1>/);
  assert.match(html, /href="\/univ\/waseda\/"/, '親ページへのリンクが無い');
  assert.match(html, /テスト学部の出題形式に合わせた重点対策/);
  assert.match(html, /早稲田大学%20テスト学部|早稲田大学\+テスト学部|早稲田大学 テスト学部 赤本/, '過去問検索に学部名が入っていない');
  const merged = facultyGroups({ faculties: [
    { name: 'A学部', method: 'x', subjects: 'y', slug: 'a' }, { name: 'A学部', method: 'z', subjects: 'w', slug: 'a' },
  ] });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].rows.length, 2);
});
