/**
 * ルート 1 本分の冊数と想定学習時間を数える。
 *
 * ## なぜライブラリにするか
 *
 * この数字を記事の本文に書くと、`BOOKS` の `h` を 1 つ直しただけで記事が嘘になる。
 * `build/content/articles.mjs` の決まり（難易度・問題数・想定学習時間・到達目安を
 * 本文に転記しない）と同じ理由で、**集計もビルド時に計算する。**
 *
 * ## 何を足しているか
 *
 * `routes.json` の `ROUTES[tier][track][policy]` に並ぶ本と、その tier の
 * `para`（並行して進める本）・`final`（最後の仕上げ）を合わせ、**id で重複を除いて**
 * `BOOKS[].h`（想定学習時間の代表値・時間）を足す。
 *
 * `h` は `BOOKS[].hours`（「毎日20分×2〜3か月」のような文字列）の代表値で、
 * 両者が食い違っていないことは `build/check-site.mjs` の `checkHours()` が見ている。
 *
 * ## 足していないもの（読み手に断ること）
 *
 * - **復習の周回。** `h` は 1 周ぶんの目安。2 周目以降は含まれない
 * - **模試・過去問演習の時間**のうち、ルートに本として載っていないもの
 * - 学校の授業・課題
 *
 * したがってここで出る数字は**下限**に近い。「これだけやれば受かる」ではなく
 * 「少なくともこれだけの時間が要る」と読む。算出の根拠は `/methodology/`。
 */

/** ルートの並びそのものではないキー。generate-routes.mjs と同じ */
const NON_TRACK = new Set(['para', 'final', 'basic']);

/** 並びの型。`omni` = 王道網羅型 / `quick` = 時短・精選型 */
export const POLICIES = [
  { key: 'omni', label: '王道網羅型' },
  { key: 'quick', label: '時短・精選型' },
];

/** その tier が持つトラック（文系・理系、現代文・古文・漢文 など） */
export function tracksOf(d, tierId) {
  const node = d.routes[tierId];
  if (!node) return [];
  return Object.keys(node).filter(k => !NON_TRACK.has(k) && node[k]);
}

/**
 * ルート 1 本（tier × track × policy）の冊数と時間。
 *
 * @returns {{books:number, hours:number, missing:number}|null}
 *   `missing` は `h` を持たない本の数。**0 でないときは合計が実際より小さい**ので、
 *   呼び出し側は必ず表示するか、その行を出さないかを決めること
 */
export function routeTotal(d, tierId, track, policy) {
  const node = d.routes[tierId];
  if (!node || !node[track]) return null;
  const seq = node[track][policy];
  if (!seq || !seq.length) return null;

  const ids = new Set(seq.map(s => s.id));
  for (const kind of ['para', 'final']) {
    const v = node[kind];
    if (!v) continue;
    const arr = Array.isArray(v) ? v : (v[track] || v['*'] || []);
    for (const s of arr || []) ids.add(s.id);
  }

  const byId = new Map(d.books.map(b => [b.id, b]));
  let hours = 0;
  let missing = 0;
  for (const id of ids) {
    const b = byId.get(id);
    const h = b && b.h;
    if (typeof h === 'number' && Number.isFinite(h)) hours += h;
    else missing++;
  }
  return { books: ids.size, hours, missing };
}

/**
 * 全科目を合わせた総時間の見積もり。
 *
 * **科目の組み合わせは受験生ごとに違う**ので、代表的な 1 例を決め打ちする。
 * どの組み合わせで出した数字かを画面に必ず書くこと（書かないと、
 * 「自分は地学選択なのに数字が合わない」という読み違いを生む）。
 *
 * トラック名は科目データのキー。存在しない科目・トラックは黙って飛ばさず
 * `missingTracks` に出す（志望レベルによっては数学を持たない、などがあるため）。
 */
export const COMBOS = [
  {
    id: 'bun',
    label: '文系',
    note: '英語・数学（文系）・国語（現代文＋古文＋漢文）・社会 1 科目（日本史）',
    parts: [
      { dir: 'english', tracks: ['bun'] },
      { dir: 'math', tracks: ['bun'] },
      { dir: 'japanese', tracks: ['gendai', 'kobun', 'kanbun'] },
      { dir: 'social', tracks: ['nihonshi'] },
    ],
  },
  {
    id: 'ri',
    label: '理系',
    note: '英語・数学（理系）・国語（現代文＋古文＋漢文）・理科 2 科目（物理＋化学）',
    parts: [
      { dir: 'english', tracks: ['ri'] },
      { dir: 'math', tracks: ['ri'] },
      { dir: 'japanese', tracks: ['gendai', 'kobun', 'kanbun'] },
      { dir: 'science', tracks: ['butsuri', 'kagaku'] },
    ],
  },
];

/**
 * 1 つの組み合わせ・1 つの志望レベルの合計。
 *
 * @param {object} data   {dir: 科目データ}
 * @param {object} combo  COMBOS の 1 つ
 * @param {string} tierId 志望レベル
 * @param {string} policy 'omni' | 'quick'
 * @returns {{books:number, hours:number, missing:number, missingTracks:string[]}}
 */
export function comboTotal(data, combo, tierId, policy) {
  let books = 0;
  let hours = 0;
  let missing = 0;
  const missingTracks = [];

  for (const part of combo.parts) {
    const d = data[part.dir];
    if (!d) { missingTracks.push(`${part.dir}（科目データが無い）`); continue; }
    for (const track of part.tracks) {
      const t = routeTotal(d, tierId, track, policy);
      if (!t) { missingTracks.push(`${part.dir}/${track}`); continue; }
      books += t.books;
      hours += t.hours;
      missing += t.missing;
    }
  }
  return { books, hours, missing, missingTracks };
}

/** 1 日あたり n 時間で割ったときの月数。小数第 1 位まで */
export function monthsAt(hours, hoursPerDay) {
  return Math.round((hours / hoursPerDay / 30.4) * 10) / 10;
}
