/**
 * 科目トップ（単一 HTML の SPA）の主要ブロックを、初期状態の HTML として
 * ファイルに書き込む。
 *
 *   node build/prerender-tops.mjs         書き込む
 *   node build/prerender-tops.mjs --check ずれていれば終了コード 1 で落ちる
 *
 * **なぜ要るか。** 参考書図鑑・志望レベル一覧・講師ルート・学習ガイドは
 * `getElementById(...).innerHTML = …` で描いている。JS が動く画面では問題ないが、
 * 検索エンジン・リンクプレビュー・JS を切った環境が受け取る HTML では中身が空で、
 * 図鑑は「0 冊を表示中」と出る。1,390 冊を並べていることが外から見えない。
 *
 * **どうやるか。** カードの HTML をここに書き写すと、科目トップ側を直したときに
 * 必ずずれる。そこで**ページ自身の描画関数を vm 上で実行して結果を回収する**。
 * DOM は「innerHTML / textContent を記録するだけ」のスタブで代替し、
 * 回収した文字列を対応する要素へ流し込む。JS が動く環境では初期化のときに
 * 同じ関数が同じ内容で上書きするので、画面の挙動は変わらない。
 *
 * 流し込む位置は要素の id で決まる。マーカーのコメントは置かない
 * （置くと手で編集したときに壊れる）。空要素・既に流し込んだ要素のどちらでも
 * 中身を差し替えられるよう、開始タグから対応する閉じタグまでを数えて置き換える。
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { extractSubject, SUBJECTS } from './lib/extract.mjs';
import { recordDate, saveDates } from './lib/updated.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/**
 * 図鑑のグリッドに静的で載せるカードの枚数。
 *
 * 全冊を静的に出すと、同じカードが `/<科目>/books/` と科目トップの 2 か所に
 * 並ぶ。理科は 373 冊あり、HTML が 1.5MB（gzip 258KB）まで膨らむうえ、
 * 検索エンジンからは 2 ページが重複して見える。**全冊の索引は
 * `/<科目>/books/` が静的に持っている**ので、こちらは「空に見えない」ことと
 * 「総数が正しく出ること」を満たす枚数だけにして、続きへのリンクを添える。
 */
const CATALOG_STATIC_CARDS = 18;

/** 静的に出しておく要素と、それを描く関数。関数が無い科目は飛ばす */
const TARGETS = [
  { id: 'bookGrid', render: 'renderCatalog', trim: true },
  { id: 'catCount', render: 'renderCatalog', text: true },
  { id: 'filterScroll', render: 'renderCatalog' },
  { id: 'homeRoutes', render: 'renderHome' },
  { id: 'homeSenseis', render: 'renderHome' },
  { id: 'homeDisclaimer', render: 'renderHome' },
  { id: 'catDisclaimer', render: 'renderHome' },
  { id: 'guideDisclaimer', render: 'renderHome' },
  { id: 'guideList', render: 'renderGuide' },
];

/**
 * 科目トップの最終更新日。
 *
 * git のコミット日を入れると、この処理が書き込んだこと自体が次の更新日になり、
 * 流すたびに日付が動く。BOOKS / ROUTES / TIERS / GUIDES のハッシュが変わった日
 * （＝読者にとって中身が変わった日）を台帳から引く。
 */
function topUpdated(dir) {
  const d = extractSubject(ROOT, dir);
  return recordDate(`top/${dir}`, {
    books: d.books, routes: d.routes, tiers: d.tiers, guides: d.guides, unis: d.unis.length,
  });
}

/**
 * 描画関数を走らせて、各要素に入る HTML を集める。
 *
 * ページの初期化処理は DOM に触れて落ちるので、定義だけを読み込んだ状態で
 * 目的の関数を名指しで呼ぶ。呼べなかった関数は結果に出ないだけで、止めない。
 */
function collect(src) {
  const captured = new Map();

  const el = id => ({
    get innerHTML() { return captured.get(id)?.html ?? ''; },
    set innerHTML(v) { captured.set(id, { ...captured.get(id), html: String(v) }); },
    get textContent() { return captured.get(id)?.text ?? ''; },
    set textContent(v) { captured.set(id, { ...captured.get(id), text: String(v) }); },
    // 図鑑は検索欄と並べ替えの値を読む。初期状態は「空欄・既定の並び」
    value: id === 'sortSel' ? 'field' : '',
    classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } },
    dataset: {},
    style: {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {}, focus() {}, remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild() {}, closest() { return null; }, scrollIntoView() {},
    offsetParent: null, children: [], parentNode: null,
  });

  const nodes = new Map();
  const doc = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, el(id));
      return nodes.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return el('#tmp'); },
    addEventListener() {}, removeEventListener() {},
    body: { style: {}, classList: { add() {}, remove() {} } },
    documentElement: { style: {} },
    activeElement: null,
    contains() { return false; },
  };

  const noop = () => {};
  const ctx = {
    console: { log: noop, warn: noop, error: noop },
    document: doc,
    window: { addEventListener: noop, location: { hash: '', href: '', search: '' }, matchMedia: () => ({ matches: false, addEventListener: noop }) },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    navigator: { clipboard: { writeText: () => Promise.resolve() }, userAgent: '' },
    location: { hash: '', href: '', search: '' },
    history: { replaceState: noop, pushState: noop },
    setTimeout: noop, setInterval: noop, clearTimeout: noop,
    addEventListener: noop, requestAnimationFrame: noop,
    URL: globalThis.URL, URLSearchParams: globalThis.URLSearchParams,
    encodeURIComponent: globalThis.encodeURIComponent,
    decodeURIComponent: globalThis.decodeURIComponent,
    Math, Date, JSON, Intl,
  };
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);

  const scripts = [...src.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]);
  for (const code of scripts) {
    try {
      vm.runInContext(code, ctx, { timeout: 30000 });
    } catch {
      // 初期化処理が DOM に触れて落ちるのは想定内。関数の定義はその前に済んでいる
    }
  }

  const done = new Set();
  for (const t of TARGETS) {
    if (done.has(t.render)) continue;
    done.add(t.render);
    const fn = ctx[t.render];
    if (typeof fn !== 'function') continue;
    try { fn(); } catch (e) { console.warn(`  ! ${t.render}() が最後まで走らなかった: ${e.message}`); }
  }
  return captured;
}

/**
 * id を持つ要素の中身を差し替える。開始タグから、入れ子を数えて対応する
 * 閉じタグまでを取り替える。
 */
function replaceInner(src, id, inner) {
  const open = new RegExp(`<(\\w+)([^>]*\\bid="${id}"[^>]*)>`);
  const m = open.exec(src);
  if (!m) return null;
  const tag = m[1];
  const start = m.index + m[0].length;
  const re = new RegExp(`</?${tag}\\b[^>]*>`, 'g');
  re.lastIndex = start;
  let depth = 1, end = -1, x;
  while ((x = re.exec(src))) {
    depth += x[0][1] === '/' ? -1 : 1;
    if (depth === 0) { end = x.index; break; }
  }
  if (end < 0) return null;
  if (src.slice(start, end) === inner) return { src, changed: false };
  return { src: src.slice(0, start) + inner + src.slice(end), changed: true };
}

/**
 * 図鑑のグリッドを先頭 CATALOG_STATIC_CARDS 枚に切る。
 *
 * カードと役割の見出しはどちらも兄弟要素として並んでいるので、その開始位置で
 * 切り分ければ入れ子は壊れない。残りは JS が起動したときに描き直す。
 */
function trimCatalog(html, dir, total) {
  const parts = html.split(/(?=<div class="(?:book-card|cat-sec)")/).filter(Boolean);
  const kept = [];
  let cards = 0;
  for (const part of parts) {
    if (part.startsWith('<div class="book-card"')) {
      if (cards >= CATALOG_STATIC_CARDS) break;
      cards++;
    }
    kept.push(part);
  }
  // 見出しだけが末尾に残ったら落とす（中身の無いセクションを出さない）
  while (kept.length && kept[kept.length - 1].startsWith('<div class="cat-sec"')) kept.pop();
  if (cards >= total) return kept.join('');
  return `${kept.join('')}<div class="cat-more"><p>ここに出しているのは ${cast(total)} 冊のうち難易度順で最初の ${cards} 冊です。続きは絞り込み・並べ替えで表示されます。</p><a href="/${dir}/books/">${cast(total)} 冊すべてを役割別の索引で見る</a></div>`;
}

const cast = n => Number(n).toLocaleString('en-US');

let changedFiles = 0;
const stale = [];

for (const sub of SUBJECTS) {
  const file = path.join(ROOT, sub.dir, 'index.html');
  const original = fs.readFileSync(file, 'utf8');
  const captured = collect(original);

  let src = original;
  let n = 0;
  const missing = [];
  for (const t of TARGETS) {
    const got = captured.get(t.id);
    if (!got) continue;
    let inner = t.text ? (got.text ?? '') : (got.html ?? '');
    if (!inner) continue;
    if (t.trim) inner = trimCatalog(inner, sub.dir, Number(captured.get('catCount')?.text || 0));
    const out = replaceInner(src, t.id, inner);
    if (!out) { missing.push(t.id); continue; }
    if (out.changed) n++;
    src = out.src;
  }
  if (missing.length) console.warn(`  ! ${sub.dir}: 要素が見つからない — ${missing.join(', ')}`);

  const upd = topUpdated(sub.dir);
  const outU = replaceInner(src, 'topUpdated', `最終更新: <time datetime="${upd}">${upd}</time>`);
  if (outU) { if (outU.changed) n++; src = outU.src; } else console.warn(`  ! ${sub.dir}: topUpdated が見つからない`);

  if (src === original) {
    console.log(`  = ${sub.dir}: 変化なし`);
    continue;
  }
  if (CHECK) {
    stale.push(`${sub.dir}/index.html（${n} 箇所）`);
    continue;
  }
  fs.writeFileSync(file, src, 'utf8');
  changedFiles++;
  console.log(`  ✓ ${sub.dir}: ${n} 箇所を静的化した`);
}

if (CHECK && stale.length) {
  console.error(`\n静的化した中身が古い: ${stale.join(' / ')}`);
  console.error('node build/prerender-tops.mjs で書き直す。');
  process.exit(1);
}
/* ポータルの最終更新日は、科目トップの更新日のうちいちばん新しいもの。
   サイト全体で「いつデータが動いたか」を出す。 */
{
  const file = path.join(ROOT, 'index.html');
  const original = fs.readFileSync(file, 'utf8');
  const newest = SUBJECTS.map(s => topUpdated(s.dir)).sort().pop();
  const out = replaceInner(original, 'topUpdated', `最終更新: <time datetime="${newest}">${newest}</time>`);
  if (!out) console.warn('  ! index.html: topUpdated が見つからない');
  else if (out.changed) {
    if (CHECK) stale.push('index.html（最終更新日）');
    else { fs.writeFileSync(file, out.src, 'utf8'); changedFiles++; console.log('  ✓ index.html: 最終更新日を入れた'); }
  }
}

if (!CHECK) saveDates();
console.log(CHECK ? '静的化した中身は最新' : `${changedFiles} 枚を書き換えた`);
