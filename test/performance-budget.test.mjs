/**
 * 性能の予算。**決定的な検査だけを置く。**
 *
 * Lighthouse はネットワークと機械の状態で値が動くので、CI の必須ゲートにしない
 * （`npm run audit:performance` が測って記録するだけにしてある）。
 * ここではバイト数と構造という、同じ入力なら必ず同じ答えになるものだけを見る。
 *
 * ## なぜ予算が要るか
 *
 * 2026-09 の監査時点で、理科の科目トップは 977,442 バイトあった。データも描画コードも
 * 1 枚の HTML に入っていたためで、mobile の Performance は 47、LCP は 10 秒台だった。
 * データを `data/subjects/` へ、描画コードを `assets/js/subject-<科目>.js` へ移して
 * 165,181 バイトまで減らした。**放っておくとまた膨らむ**ので、上限を検査で固定する。
 *
 * ## 予算の決め方
 *
 * 実測値より少し上に置く。ぎりぎりに締めると、正当な追記のたびに落ちて
 * 「とりあえず予算を上げる」運用になり、歯止めの意味が消える。
 * 逆に緩すぎると気づけないので、いまの倍までは許さない水準にする。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { SUBJECTS } from '../build/lib/extract.mjs';

const bytes = (rel) => fs.statSync(path.join(ROOT, rel)).size;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** 科目トップ HTML の上限。理科・社会が 165〜167KB なので、そこから余裕を見た値 */
const SUBJECT_HTML_MAX = 250_000;

/** 理科は最大の科目。ここを締めておくと他は自然に収まる */
const SCIENCE_HTML_MAX = 200_000;

/** 全ページ共通の検索索引。S8 で膨らませないための歯止め（実測 235,925） */
const BOOK_INDEX_MAX = 300_000;

/** 配信アセット 1 本あたりの上限（実測の最大は science.books.json の 429,123） */
const ASSET_MAX = 500_000;

/** 科目ごとの描画コード（実測の最大は subject-science.js の 98,794） */
const SUBJECT_APP_MAX = 150_000;

test('科目トップの HTML がバイト予算に収まっている', () => {
  const over = [];
  for (const s of SUBJECTS) {
    const n = bytes(`${s.dir}/index.html`);
    if (n >= SUBJECT_HTML_MAX) over.push(`${s.dir}: ${n.toLocaleString()} バイト（上限 ${SUBJECT_HTML_MAX.toLocaleString()}）`);
  }
  assert.deepEqual(over, [], over.join('\n'));
});

test('理科の科目トップが 200,000 バイト未満', () => {
  const n = bytes('science/index.html');
  assert.ok(n < SCIENCE_HTML_MAX,
    `science/index.html が ${n.toLocaleString()} バイト（上限 ${SCIENCE_HTML_MAX.toLocaleString()}）`);
});

test('科目トップに BOOKS / ROUTES / UNIS のデータが埋まっていない', () => {
  // 「データを外へ出した」ことを、サイズではなく中身で確かめる。
  // 一部だけ HTML へ戻すと、サイズ予算には収まったまま元の構造へ逆戻りする
  const back = [];
  for (const s of SUBJECTS) {
    const html = read(`${s.dir}/index.html`);
    for (const name of ['BOOKS', 'ROUTES', 'UNIS', 'UNI_RAW', 'GUIDES', 'TIERS', 'STAGES']) {
      if (new RegExp(`^const ${name}\\s*=`, 'm').test(html)) back.push(`${s.dir}: const ${name}`);
    }
    // JSON をそのまま埋め直していないか（配信マニフェストの files / bytes は除く）
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g)]
      .map(m => m[1]).join('\n');
    if (/"isbn13"\s*:/.test(inline)) back.push(`${s.dir}: 書誌データがインライン script に入っている`);
  }
  assert.deepEqual(back, [], back.join('\n'));
});

test('科目ごとの描画コードが予算に収まっている', () => {
  const over = [];
  for (const s of SUBJECTS) {
    const rel = `assets/js/subject-${s.dir}.js`;
    const n = bytes(rel);
    if (n >= SUBJECT_APP_MAX) over.push(`${rel}: ${n.toLocaleString()} バイト（上限 ${SUBJECT_APP_MAX.toLocaleString()}）`);
  }
  assert.deepEqual(over, [], over.join('\n'));
});

test('全ページ共通の検索索引が膨らんでいない', () => {
  const n = bytes('assets/js/book-index.js');
  assert.ok(n < BOOK_INDEX_MAX,
    `assets/js/book-index.js が ${n.toLocaleString()} バイト（上限 ${BOOK_INDEX_MAX.toLocaleString()}）。`
    + ' 出版社・著者・難易度などの絞り込み用の項目はここへ足さず、'
    + ' /search/ でだけ読む別の索引へ入れる');
});

test('配信アセット 1 本が上限を超えていない', () => {
  const dir = path.join(ROOT, 'assets', 'generated', 'subjects');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  assert.ok(files.length >= SUBJECTS.length, `配信アセットが ${files.length} 本しかない`);
  const over = files
    .map(f => ({ f, n: fs.statSync(path.join(dir, f)).size }))
    .filter(x => x.n >= ASSET_MAX)
    .map(x => `${x.f}: ${x.n.toLocaleString()} バイト（上限 ${ASSET_MAX.toLocaleString()}）`);
  assert.deepEqual(over, [], over.join('\n'));
});

test('科目トップの画像は、読み込む前から場所が決まっている', () => {
  /* 画像が届いてから場所が決まると、本文が押し下げられる（CLS）。
     width/height 属性を持つか、CSS で入る箱の大きさが決まっているかのどちらかが要る。

     科目トップの書影は後者。`.bcov{width:…;aspect-ratio:.71}` が箱を決め、
     `.bcov img{width:100%;height:100%}` がその中を埋める。
     **属性が無いこと自体は問題ではない。箱が決まっていないことが問題。** */
  for (const s of SUBJECTS) {
    const html = read(`${s.dir}/index.html`);

    assert.match(html, /\.bcov\{[^}]*aspect-ratio:/,
      `${s.dir}: .bcov に aspect-ratio が無い。書影の箱が決まらず、読み込みで版面がずれる`);
    assert.match(html, /\.bcov img\{[^}]*width:100%[^}]*height:100%/,
      `${s.dir}: .bcov img が箱を埋めていない`);

    const loose = [];
    for (const m of html.matchAll(/<img\b[^>]*>/g)) {
      const tag = m[0];
      if (/\bwidth=/.test(tag) && /\bheight=/.test(tag)) continue;
      // 箱が決まっている書影（.bcov の中）だけを許す
      const before = html.slice(Math.max(0, m.index - 400), m.index);
      if (/class="bcov"/.test(before)) continue;
      loose.push(tag.slice(0, 120));
    }
    assert.deepEqual(loose, [],
      `${s.dir}: 大きさの決まっていない画像がある:\n${loose.join('\n')}`);
  }
});

test('科目トップの JavaScript が描画をブロックしていない', () => {
  /* 2026-09-05 の実測: 描画をブロックしていたのは
     Google Fonts のスタイルシート 2,122ms / share.js 1,051ms / pace.js 751ms /
     bunri.js 451ms / analytics.js 301ms の 5 本で、合計 4,676ms だった。
     自前の 4 本に defer を付けて 1 本 2,889ms（Google Fonts だけ）になった。
     **付け忘れると元に戻るので、ここで固定する。** */
  for (const s of SUBJECTS) {
    const html = read(`${s.dir}/index.html`);
    const blocking = [...html.matchAll(/<script\b[^>]*\bsrc="\/assets\/[^"]*"[^>]*>/g)]
      .map(m => m[0])
      .filter(t => !/\bdefer\b/.test(t) && !/\basync\b/.test(t));
    assert.deepEqual(blocking, [],
      `${s.dir}: defer も async も付いていない自前のスクリプトがある:\n${blocking.join('\n')}`);
  }
});

test('生成ページの JavaScript も描画をブロックしていない', () => {
  // 1,390 冊の書籍ページと一覧ページ。effect はこちらのほうが大きい
  const samples = [];
  for (const s of SUBJECTS) {
    const dir = path.join(ROOT, s.dir, 'books');
    if (!fs.existsSync(dir)) continue;
    const slug = fs.readdirSync(dir, { withFileTypes: true }).find(e => e.isDirectory())?.name;
    if (slug) samples.push(`${s.dir}/books/${slug}/index.html`);
    samples.push(`${s.dir}/books/index.html`);
  }
  assert.ok(samples.length >= 7, '生成ページを読めていない。先に npm run build を流す');
  for (const rel of samples) {
    const html = read(rel);
    const blocking = [...html.matchAll(/<script\b[^>]*\bsrc="\/assets\/[^"]*"[^>]*>/g)]
      .map(m => m[0])
      .filter(t => !/\bdefer\b/.test(t) && !/\basync\b/.test(t));
    assert.deepEqual(blocking, [], `${rel}: 描画をブロックする自前のスクリプトがある:\n${blocking.join('\n')}`);
  }
});
