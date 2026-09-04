/**
 * アフィリエイト開示と Amazon アソシエイトの必須表記が、生成ページから消えていないことを固定する。
 *
 * ## なぜこの検査が要るか
 *
 * `build/lib/extract.mjs` の `affiliateEnabled()` / `amazonEnabled()` は、もともと
 * **科目 HTML を正規表現で直接読んで** ID の有無を判定していた。
 *
 *     const tag = src.match(/\bamazonTag:\s*"([^"]*)"/);
 *
 * 科目データを HTML の外（`data/subjects/<科目>/config.json`）へ移すと、この正規表現は
 * 何にもマッチしなくなり、**戻り値が例外も警告も出さずに `false` になる**。
 * その結果、生成される 1,390 ページからアフィリエイト開示と Amazon の必須表記が
 * まるごと消える。**これは表示崩れではなく規約違反になる。**
 *
 * だからデータ移行に手を付ける前に、ここで出力を固定しておく。
 * この検査は「CONFIG がどこに置かれているか」に依存してはいけない。
 *
 * ## ID そのものは扱わない
 *
 * アフィリエイト ID・GA4 ID・AdSense ID を、このファイルにも失敗メッセージにも書かない。
 * 見るのは「ID が入っているか」という真偽値と、「開示文が出ているか」だけ。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { SUBJECTS } from '../build/lib/extract.mjs';
import os from 'node:os';
import { loadSubjectData, affiliateEnabled, amazonEnabled, clearSubjectCache } from '../build/lib/load-subject-data.mjs';
import { AMAZON_NAME } from '../build/lib/parts.mjs';

/** 開示文。build/lib/parts.mjs が実際に書き出す文言と揃える */
const AFF_TEXT = '当サイトはアフィリエイト広告を利用しています。';
const AZ_TEXT = `Amazon のアソシエイトとして、${AMAZON_NAME}は適格販売により収入を得ています。`;

const AFF = affiliateEnabled(ROOT);
const AZ = amazonEnabled(ROOT);

/** コメントを落とす。説明文に書いた「昔の実装」が検査に引っかからないようにする */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** 生成された書籍ページを何枚か拾う。全 1,390 枚を読むと遅いので代表を見る */
function sampleBookPages(perSubject = 3) {
  const out = [];
  for (const s of SUBJECTS) {
    const dir = path.join(ROOT, s.dir, 'books');
    if (!fs.existsSync(dir)) continue;
    const slugs = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name).sort();
    for (const slug of slugs.slice(0, perSubject)) {
      const f = path.join(dir, slug, 'index.html');
      if (fs.existsSync(f)) out.push({ rel: `${s.dir}/books/${slug}/index.html`, src: fs.readFileSync(f, 'utf8') });
    }
    const idx = path.join(dir, 'index.html');
    if (fs.existsSync(idx)) out.push({ rel: `${s.dir}/books/index.html`, src: fs.readFileSync(idx, 'utf8') });
  }
  return out;
}

test('CONFIG の在り処（HTML / JSON）を変えても判定が変わらない', () => {
  // これがこのファイルの本体。**元のバグを実際に再現できる形で確かめる。**
  //
  // 以前の実装は科目 HTML を正規表現で読んでいたので、CONFIG を JSON へ移した瞬間に
  // 判定が false へ落ちた。ここでは一時ディレクトリに「HTML が 1 枚も無く、
  // data/subjects/<科目>/ だけがある」ルートを作り、同じ判定結果になることを見る。
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-aff-'));
  try {
    for (const s of SUBJECTS) {
      const d = loadSubjectData(ROOT, s.dir);
      const dst = path.join(tmp, 'data', 'subjects', s.dir);
      fs.mkdirSync(dst, { recursive: true });
      const w = (f, o) => fs.writeFileSync(path.join(dst, f), JSON.stringify({ schemaVersion: 1, ...o }));
      w('books.json', { books: d.books });
      w('universities.json', { universities: d.unis });
      w('routes.json', { routes: d.routes, tiers: d.tiers });
      w('guides.json', { guides: d.guides });
      w('stages.json', { stages: d.stages });
      w('config.json', { config: d.config });
    }
    // 一時ルートには <科目>/index.html が 1 枚も無い。
    // HTML を読む実装が残っていれば、ここで例外になるか false になる
    for (const s of SUBJECTS) {
      assert.equal(fs.existsSync(path.join(tmp, s.dir, 'index.html')), false);
    }
    clearSubjectCache();
    assert.equal(affiliateEnabled(tmp), AFF, 'CONFIG を JSON へ移すと affiliateEnabled() の答えが変わる');
    assert.equal(amazonEnabled(tmp), AZ, 'CONFIG を JSON へ移すと amazonEnabled() の答えが変わる');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    clearSubjectCache();
  }
});

test('広告表記の判定を build/lib/extract.mjs へ戻していない', () => {
  const ex = fs.readFileSync(path.join(ROOT, 'build/lib/extract.mjs'), 'utf8');
  const code = stripComments(ex);
  assert.ok(!/export function (affiliateEnabled|amazonEnabled)/.test(code),
    'extract.mjs に判定が戻っている。canonical な CONFIG から判定する');
  assert.ok(!/amazonTag/.test(code), 'extract.mjs が amazonTag を直接読んでいる');

  const loader = stripComments(fs.readFileSync(path.join(ROOT, 'build/lib/load-subject-data.mjs'), 'utf8'));
  assert.ok(!/index\.html/.test(loader.slice(loader.indexOf('export function affiliateEnabled'))),
    '判定が科目 HTML を読んでいる');
});

test('全科目の CONFIG が同じキーを持つ', () => {
  for (const s of SUBJECTS) {
    const cfg = loadSubjectData(ROOT, s.dir).config;
    assert.equal(typeof cfg, 'object', `${s.dir}: CONFIG が取れない`);
    for (const k of ['amazonTag', 'rakutenId']) {
      assert.equal(typeof cfg[k], 'string', `${s.dir}: CONFIG.${k} が文字列でない`);
    }
  }
});

test('判定は「どこかの科目に ID が入っているか」で決まる', () => {
  const anyAmazon = SUBJECTS.some(s => Boolean(loadSubjectData(ROOT, s.dir).config.amazonTag));
  const anyAff = SUBJECTS.some(s => {
    const c = loadSubjectData(ROOT, s.dir).config;
    return Boolean(c.amazonTag || c.rakutenId);
  });
  assert.equal(AZ, anyAmazon, 'amazonEnabled() が CONFIG の実態と食い違っている');
  assert.equal(AFF, anyAff, 'affiliateEnabled() が CONFIG の実態と食い違っている');
});

test('ID があるときだけ、書籍ページにアフィリエイト開示が出る', () => {
  const pages = sampleBookPages();
  assert.ok(pages.length >= 7, `書籍ページを読めていない（${pages.length} 枚）。先に npm run build を流す`);
  for (const p of pages) {
    assert.equal(p.src.includes(AFF_TEXT), AFF,
      AFF ? `${p.rel}: アフィリエイト開示が消えている` : `${p.rel}: 未参加なのに開示文が出ている`);
  }
});

test('Amazon の ID があるときだけ、必須表記が出る', () => {
  const pages = sampleBookPages();
  for (const p of pages) {
    assert.equal(p.src.includes(AZ_TEXT), AZ,
      AZ ? `${p.rel}: Amazon アソシエイトの必須表記が消えている` : `${p.rel}: 未参加なのに必須表記が出ている`);
  }
});

test('ID があるときは、生成された全書籍ページに開示が出ている（抜けを 1 枚も許さない）', { skip: AFF ? undefined : 'ID 未設定' }, () => {
  const missing = [];
  let checked = 0;
  for (const s of SUBJECTS) {
    const dir = path.join(ROOT, s.dir, 'books');
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const f = path.join(dir, e.name, 'index.html');
      if (!fs.existsSync(f)) continue;
      checked++;
      const src = fs.readFileSync(f, 'utf8');
      if (!src.includes(AFF_TEXT)) missing.push(`${s.dir}/books/${e.name}/ — アフィリエイト開示`);
      if (AZ && !src.includes(AZ_TEXT)) missing.push(`${s.dir}/books/${e.name}/ — Amazon 必須表記`);
    }
  }
  assert.ok(checked > 1300, `書籍ページが ${checked} 枚しか無い。先に npm run build を流す`);
  assert.deepEqual(missing.slice(0, 20), [], `${missing.length} 枚で開示が欠けている:\n${missing.slice(0, 20).join('\n')}`);
});

test('購入リンクにアフィリエイトの経路が残っている', () => {
  // 開示文（フッター）だけを見ていると取りこぼす。
  // 2026-09-05 に joho を移行したとき、build/generate-books.mjs が持っていた
  // **3 つ目の**「科目 HTML を正規表現で読む CONFIG 読み取り」が空文字を返し、
  // 購入リンクから tag= と楽天の経路 ID、rel="sponsored"、広告リンクの注記が
  // まとめて消えた。開示文は parts.mjs 経由なので無事で、テストは通ってしまった。
  const missing = [];
  let checked = 0;
  for (const s of SUBJECTS) {
    const cfg = loadSubjectData(ROOT, s.dir).config;
    const dir = path.join(ROOT, s.dir, 'books');
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const f = path.join(dir, e.name, 'index.html');
      if (!fs.existsSync(f)) continue;
      const src = fs.readFileSync(f, 'utf8');
      const buy = src.slice(src.indexOf('class="buy"'), src.indexOf('buy__note'));
      if (!buy) continue;
      // 電子版しか無い等で購入リンクを持たない本があるので、リンクがある本だけ見る
      if (!/class="az"/.test(buy) && !/class="rk"/.test(buy)) continue;
      checked++;
      const where = `${s.dir}/books/${e.name}/`;
      if (cfg.amazonTag && /class="az"/.test(buy)) {
        if (!buy.includes(`tag=${cfg.amazonTag}`)) missing.push(`${where} — Amazon の tag= が無い`);
        if (!/class="az"[^>]*rel="[^"]*sponsored/.test(buy)) missing.push(`${where} — Amazon リンクに rel=sponsored が無い`);
      }
      if (cfg.rakutenId && /class="rk"/.test(buy)) {
        if (!buy.includes(cfg.rakutenId)) missing.push(`${where} — 楽天の経路 ID が無い`);
        if (!/class="rk"[^>]*rel="[^"]*sponsored/.test(buy)) missing.push(`${where} — 楽天リンクに rel=sponsored が無い`);
      }
    }
  }
  assert.ok(checked > 1200, `購入リンクを持つ書籍ページが ${checked} 枚しか無い。先に npm run build を流す`);
  assert.deepEqual(missing.slice(0, 20), [],
    `${missing.length} 件で購入リンクの経路が欠けている:\n${missing.slice(0, 20).join('\n')}`);
});

test('広告リンクの注記が、ID がある販売サイトの名前で出ている', () => {
  const pages = sampleBookPages();
  for (const p of pages) {
    if (!/class="az"|class="rk"/.test(p.src)) continue;
    const note = p.src.slice(p.src.indexOf('buy__note'), p.src.indexOf('buy__note') + 400);
    if (!AFF) continue;
    assert.match(note, /広告リンクです/, `${p.rel}: 購入リンクの広告注記が消えている`);
  }
});

test('科目 HTML を正規表現で読んで CONFIG を取るコードが build/ に残っていない', () => {
  // 同じ事故が別のスクリプトで再発しないようにする。
  // 2026-09 時点で、この読み方は extract.mjs / generate-books.mjs / load-subject-data.mjs の
  // 3 か所にあった（うち 2 つは移行で壊れた）。
  const bad = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['.cache', 'data', 'content', 'ogp'].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.mjs')) continue;
      const code = stripComments(fs.readFileSync(p, 'utf8'));
      // 危ないのは「ID のキー名から検索の型を組み立てて、HTML の文字列に当てる」形。
      // config.amazonTag のように canonical データから読む書き方は問題ない。
      const buildsPattern = /(?:new RegExp\([^)]*|\/[^\n\/]*)(?:amazonTag|rakutenId)/.test(code);
      if (buildsPattern && /\.match\(/.test(code)) {
        bad.push(path.relative(ROOT, p));
      }
    }
  };
  walk(path.join(ROOT, 'build'));
  // ポータル（index.html）の CONFIG はまだ HTML にある。generate-legal.mjs はそれを読む。
  // 科目データの移行とは別の話なので、いまは対象外にする。
  const allowed = new Set(['build/generate-legal.mjs']);
  assert.deepEqual(bad.filter(f => !allowed.has(f)), [],
    `CONFIG は canonical データから読む。HTML を正規表現で読むと、移行したときに黙って空になる:\n${bad.join('\n')}`);
});

test('開示文に ID そのものが出ていない', () => {
  const cfg = loadSubjectData(ROOT, SUBJECTS[0].dir).config;
  const pages = sampleBookPages(1);
  for (const p of pages) {
    // amazonTag はリンクの tag= に出るのが正しい。開示文の側に出ていないことを見る
    const foot = p.src.slice(p.src.indexOf('foot-legal'));
    if (cfg.rakutenId) {
      assert.ok(!foot.includes(cfg.rakutenId), `${p.rel}: 開示文に楽天の ID が出ている`);
    }
  }
});
