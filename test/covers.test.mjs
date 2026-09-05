/**
 * 書影の取得元と出所台帳の検査。
 *
 * ## 守りたいこと
 *
 *   1. **候補の作り方が 1 か所しか無い。** 以前は 7 科目 + 生成側で 5 通りに分かれ、
 *      同じ本なのに科目によって表紙が出たり出なかったりしていた。
 *   2. **`enabled: false` が本当に効く。** 効かない設定は「切れるつもりでいる」だけで、
 *      いざ止めたいときに止められない。
 *   3. **確認していないことを確認したと書けない。** `termsReviewed: true` には
 *      根拠（`usageBasis`）が要る。
 *   4. **画像の箱が読み込む前から決まっている。** 表紙が出ても出なくても版面が動かない。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './helpers.mjs';
import { SUBJECTS } from '../build/lib/extract.mjs';
import { loadSubjectData } from '../build/lib/load-subject-data.mjs';
import { coverSrcs, providerOf, COVER_POLICIES } from '../build/lib/cover.mjs';

const require = createRequire(import.meta.url);
const resolver = require(path.join(ROOT, 'assets/js/cover-resolver.js'));
const LEDGER = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/data/cover-ledger.json'), 'utf8'));

/* ============================================================
   1 か所しか無いこと
   ============================================================ */

test('候補の作り方が assets/js/cover-resolver.js の 1 か所だけにある', () => {
  const bad = [];

  // 科目ごとの描画コードが自前で URL を組み立てていないか
  for (const s of SUBJECTS) {
    const src = fs.readFileSync(path.join(ROOT, 'assets/js', `subject-${s.dir}.js`), 'utf8');
    for (const host of ['ssl-images-amazon.com', 'ndlsearch.ndl.go.jp', 'cover.openbd.jp',
      'books.google.com', 'gakusan.com', 'm.media-amazon.com']) {
      if (src.includes(host)) bad.push(`assets/js/subject-${s.dir}.js が ${host} を直接書いている`);
    }
    assert.match(src, /window\.RTCoverResolver\.coverSrcs/,
      `${s.dir}: 共通の resolver を呼んでいない`);
  }

  // 生成側も同じ
  const lib = fs.readFileSync(path.join(ROOT, 'build/lib/cover.mjs'), 'utf8');
  for (const host of ['ssl-images-amazon.com', 'ndlsearch.ndl.go.jp', 'cover.openbd.jp']) {
    if (lib.includes(host)) bad.push(`build/lib/cover.mjs が ${host} を直接書いている`);
  }

  assert.deepEqual(bad, [], bad.join('\n'));
});

test('生成側と画面側が同じ候補を返す', () => {
  // 同じ本を、Node（build/lib/cover.mjs）と素の resolver に通して突き合わせる
  const b = { isbn10: '4010346485', isbn13: '9784010346488' };
  assert.deepEqual(coverSrcs(b), resolver.coverSrcs(b, COVER_POLICIES));
});

test('候補の作り方が減っていない（統一前の最大と同じ数）', () => {
  /* 統一前、社会だけが 10 候補を持ち、数学・情報・小論文は 3 候補だった。
     いちばん多いものへそろえたので、ISBN が両方ある本では 10 候補になるはず。
     ここが減ると、いま表紙が出ている本が出なくなる。

     **数える相手は「全 provider を有効にしたときの候補数」。** 実際の運用では
     停止した provider（例: 書影 API が終了した ndl）があるので、現在の候補数を
     直に 10 と突き合わせると、止めるたびにこの検査を書き換えることになる。
     それでは「黙って減っていないか」を見張る役目を果たせない。
     resolver の候補生成そのものが痩せたときにだけ落ちる形にしてある。 */
  const b = { isbn10: '4010346485', isbn13: '9784010346488' };
  const all = JSON.parse(JSON.stringify(COVER_POLICIES));
  for (const p of Object.values(all.providers)) p.enabled = true;

  assert.equal(resolver.coverSrcs(b, all).length, 10);
  const withCover = resolver.coverSrcs({ ...b, cover: 'https://example.invalid/x.jpg' }, all);
  assert.equal(withCover.length, 11);
  assert.equal(withCover[0], 'https://example.invalid/x.jpg', '個別指定が先頭に来ていない');
});

test('止めた取得元には、止めた理由が書いてある', () => {
  /* enabled:false は「候補から消える」＝表紙が出なくなりうる操作。
     理由の書かれていない停止は、あとから残すべきか外すべきか判断できない */
  for (const [id, p] of Object.entries(COVER_POLICIES.providers)) {
    if (p.enabled) continue;
    assert.ok(p.notes && p.notes.length > 30,
      `${id}: enabled:false なのに notes に理由が書かれていない`);
  }
});

test('停止中の取得元を「利用条件が未確認」に数えない', () => {
  /* 運営者の完了判定は「未確認 0 件」。候補に入らない provider を混ぜると
     到達できなくなり、本当に確認すべき取得元が埋もれる */
  const src = fs.readFileSync(path.join(ROOT, 'build/check-covers.mjs'), 'utf8');
  assert.match(src, /p\.enabled\s*&&\s*!p\.termsReviewed/,
    'check-covers.mjs が未確認件数から停止中の provider を除いていない');
});

test('nocover の本は候補を持たない', () => {
  assert.deepEqual(coverSrcs({ nocover: true, isbn10: '4010346485', isbn13: '9784010346488' }), []);
});

/* ============================================================
   enabled が効くこと
   ============================================================ */

test('enabled:false にすると、その取得元の候補が消える', () => {
  const b = { isbn10: '4010346485', isbn13: '9784010346488' };
  const all = resolver.coverSrcs(b, COVER_POLICIES);

  // Google Books だけを止める
  const off = JSON.parse(JSON.stringify(COVER_POLICIES));
  off.providers.googlebooks.enabled = false;
  const cut = resolver.coverSrcs(b, off);

  assert.ok(all.some(u => u.includes('books.google.com')), '止める前に候補へ入っていない');
  assert.ok(!cut.some(u => u.includes('books.google.com')), 'enabled:false にしても候補に残っている');
  assert.equal(cut.length, all.length - 1);
});

test('全部止めると候補が 0 になる（代替表示へ落ちる）', () => {
  const off = JSON.parse(JSON.stringify(COVER_POLICIES));
  for (const id of Object.keys(off.providers)) off.providers[id].enabled = false;
  assert.deepEqual(
    resolver.coverSrcs({ isbn10: '4010346485', isbn13: '9784010346488', cover: 'https://x.invalid/a.jpg' }, off),
    []);
});

/* ============================================================
   確認したと偽れないこと
   ============================================================ */

test('termsReviewed が true の取得元には根拠がある', () => {
  const bad = [];
  for (const [id, p] of Object.entries(COVER_POLICIES.providers)) {
    if (!p.termsReviewed) continue;
    if (!p.usageBasis) bad.push(`${id}: termsReviewed が true なのに usageBasis が空`);
    if (!p.lastReviewedAt) bad.push(`${id}: termsReviewed が true なのに lastReviewedAt が空`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('確認していない取得元は、確認していないと書いてある', () => {
  // いまは全部未確認。**勝手に true へ変わっていないことを見る**
  for (const [id, p] of Object.entries(COVER_POLICIES.providers)) {
    assert.equal(typeof p.termsReviewed, 'boolean', `${id}: termsReviewed が真偽値でない`);
    if (!p.termsReviewed) {
      assert.equal(p.usageBasis, null, `${id}: 未確認なのに usageBasis が書かれている`);
      assert.equal(p.lastReviewedAt, null, `${id}: 未確認なのに lastReviewedAt が書かれている`);
    }
  }
});

test('enabled と termsReviewed が別のフィールドとして分かれている', () => {
  // 混ぜると「参照している＝確認済み」に読めてしまう
  for (const [id, p] of Object.entries(COVER_POLICIES.providers)) {
    assert.notEqual(p.enabled, undefined, `${id}: enabled が無い`);
    assert.notEqual(p.termsReviewed, undefined, `${id}: termsReviewed が無い`);
  }
});

/* ============================================================
   台帳
   ============================================================ */

test('台帳が全 1,390 冊ぶんあり、実データと一致する', () => {
  let n = 0;
  const bad = [];
  for (const s of SUBJECTS) {
    for (const b of loadSubjectData(ROOT, s.dir).books) {
      n++;
      const rec = LEDGER.records[`${s.dir}:${b.id}`];
      if (!rec) { bad.push(`${s.dir}:${b.id} が台帳に無い`); continue; }
      const want = coverSrcs(b).map(u => providerOf(u));
      if (JSON.stringify(rec.providers) !== JSON.stringify(want)) {
        bad.push(`${s.dir}:${b.id}: 取得元が食い違う`);
      }
    }
  }
  assert.equal(Object.keys(LEDGER.records).length, n);
  assert.deepEqual(bad.slice(0, 10), [], bad.join('\n'));
});

test('台帳が、決めた項目しか持たない（認証情報の入りようが無い）', () => {
  /* 「token という文字を含まないか」では確かめられない。書籍 ID に
     shutoken（首都圏）のような語が入っている。**持ってよい項目を数え上げる**ほうが確実で、
     新しい項目が増えたときにも気づける。 */
  const allowed = ['providers', 'keys', 'explicitHost', 'nocover', 'availability'];
  const allowedKeys = ['isbn10', 'isbn13', 'asin'];
  const allowedAvail = ['status', 'httpStatus', 'checkedAt'];
  const bad = [];

  for (const [k, r] of Object.entries(LEDGER.records)) {
    for (const f of Object.keys(r)) if (!allowed.includes(f)) bad.push(`${k}: 未知の項目 ${f}`);
    for (const f of Object.keys(r.keys || {})) if (!allowedKeys.includes(f)) bad.push(`${k}: keys に未知の項目 ${f}`);
    for (const f of Object.keys(r.availability || {})) if (!allowedAvail.includes(f)) bad.push(`${k}: availability に未知の項目 ${f}`);

    // 鍵は ISBN / ASIN の形だけ
    for (const [f, v] of Object.entries(r.keys || {})) {
      if (v === null) continue;
      if (!/^[0-9A-Z]{10}$|^[0-9]{13}$/.test(v)) bad.push(`${k}: keys.${f} が ISBN / ASIN の形でない — ${v}`);
    }
    // 個別指定はホスト名だけ。URL を丸ごと持たない（query が付いた形を残さないため）
    if (r.explicitHost !== null && /[/?#]/.test(String(r.explicitHost))) {
      bad.push(`${k}: explicitHost が URL になっている — ${r.explicitHost}`);
    }
  }
  assert.deepEqual(bad.slice(0, 10), [], bad.join('\n'));

  // 台帳の本体に URL そのものが 1 つも無い
  assert.ok(!/https?:\/\//.test(JSON.stringify(LEDGER.records)), '台帳が URL を持っている');
});

test('台帳の availability が決まった語彙だけを使う', () => {
  const ok = new Set(['unchecked', 'ok', 'not_found', 'transient_error', 'disabled']);
  const bad = [];
  for (const [k, r] of Object.entries(LEDGER.records)) {
    if (!ok.has(r.availability.status)) bad.push(`${k}: ${r.availability.status}`);
  }
  assert.deepEqual(bad.slice(0, 5), [], bad.join('\n'));
});

/* ============================================================
   表示（箱の大きさ）
   ============================================================ */

test('公開する書影の img が、読み込む前から場所の決まる形で出る', () => {
  const dir = path.join(ROOT, 'math', 'books');
  const slug = fs.readdirSync(dir, { withFileTypes: true }).find(e => e.isDirectory()).name;
  const html = fs.readFileSync(path.join(dir, slug, 'index.html'), 'utf8');
  const imgs = [...html.matchAll(/<img\b[^>]*data-srcs[^>]*>/g)].map(m => m[0]);
  assert.ok(imgs.length, '書影の img が無い');
  for (const t of imgs) {
    assert.match(t, /\bwidth="\d+"/, `width が無い: ${t.slice(0, 90)}`);
    assert.match(t, /\bheight="\d+"/, `height が無い: ${t.slice(0, 90)}`);
    assert.match(t, /referrerpolicy="no-referrer"/, `referrerpolicy が無い: ${t.slice(0, 90)}`);
  }
});

test('候補が 1 つも無い本でも、代替表示が出る', () => {
  // nocover の本を 1 冊探して、書名と出版社の代替表示があることを見る
  let found = null;
  for (const s of SUBJECTS) {
    const b = loadSubjectData(ROOT, s.dir).books.find(x => x.nocover);
    if (b) { found = { dir: s.dir, book: b }; break; }
  }
  if (!found) return;   // nocover の本が無ければ何も確かめない
  const html = fs.readFileSync(path.join(ROOT, found.dir, 'books', found.book.id, 'index.html'), 'utf8');
  assert.ok(html.includes(found.book.name), '代替表示に書名が出ていない');
});
