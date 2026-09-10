/**
 * ルートの「トラック」（routes.json の ROUTES[tier][トラック]）の扱いを 1 か所に置く。
 *
 * ## トラックの意味は科目で違う
 *
 *   english : bun = 国公立二次型（記述）/ ri = 私立個別型（マーク）。**文系・理系ではない**
 *   math    : bun = 文系 / ri = 理系
 *   japanese / science / social : トラック＝分野（現代文・物理・日本史 …）
 *
 * 2026-09-10 まで generate-routes.mjs と generate-universities.mjs が
 * bun を文系・ri を理系とする対応表をそれぞれ持っていたため、英語の静的ルートページが
 * 「文系のルート」「理系のルート」と誤った見出しを出していた（SPA の診断は正しい名前を
 * 出していたので、同じ URL の説明が食い違っていた）。
 * **表示名の正本は data/subjects/<科目>/config.json の trackLabels。** ここはそれを引くだけ。
 */
import { SUB_LABELS } from './extract.mjs';
// 循環 import になるが、どちらも関数の中でしか相手を使わないので読み込み順に依存しない
import { canonical } from './validate-subject-data.mjs';

/* トラックの名前として現れるが、ルートの並びそのものではないキー。
   basic は理科基礎（文系・共テのみ）のルートで、科目トップだけで使う */
export const NON_TRACK = new Set(['para', 'final', 'basic']);

/** トラックの表示順。ROUTES のキー順は科目によってばらつくのでここで固定する */
export const TRACK_ORDER = [
  'bun', 'ri',
  'gendai', 'kobun', 'koten', 'kanbun',
  'butsuri', 'kagaku', 'seibutsu', 'chigaku',
  'nihonshi', 'sekaishi', 'chiri', 'kokyo', 'seikei', 'rinri',
  'sogo',
];

export function trackRank(k) {
  const i = TRACK_ORDER.indexOf(k);
  return i < 0 ? TRACK_ORDER.length : i;
}

/**
 * トラックの表示名。
 * `d.config.trackLabels[key][form]` → `SUB_LABELS[key]` → `key` の順で解決する。
 *
 * @param {object} d    loadSubjectData() の戻り
 * @param {string} key  トラックキー
 * @param {'label'|'short'|'lead'} [form]
 *   label … 見出し用の正式名（例: 国公立二次型（記述））
 *   short … 文中で使う短い名前（例: 国公立二次型）
 *   lead  … そのトラックの説明（例: 和訳・内容説明・英作文などの記述がある）
 */
export function trackLabel(d, key, form = 'label') {
  const def = d && d.config && d.config.trackLabels && d.config.trackLabels[key];
  if (def && def[form]) return def[form];
  if (form === 'lead') return '';
  return SUB_LABELS[key] || key;
}

/** トラックのキー（para / final / basic を除く）。順序は TRACK_ORDER */
export function trackKeys(node) {
  return Object.keys(node || {})
    .filter(k => !NON_TRACK.has(k) && node[k])
    .sort((a, b) => trackRank(a) - trackRank(b));
}

/** routes.json の全志望レベルに現れるトラックキーの集合 */
export function allTrackKeys(routes) {
  const out = new Set();
  for (const node of Object.values(routes || {})) for (const k of trackKeys(node)) out.add(k);
  return out;
}

/** para / final は「トラック→配列」の辞書のことも、全トラック共通の配列のこともある */
function sideListOf(node, kind, key) {
  const v = node && node[kind];
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return Array.isArray(v[key]) ? v[key] : [];
}

const sig = (v) => JSON.stringify(canonical(v));

/**
 * 本編（omni / quick）が同一のトラックをまとめる。
 *
 * 英語は 9 段階中 8、数学は 2 段階で、bun と ri の本編がまったく同じ並びになっている。
 * トラックごとに節を出すと、同じ 8 冊＋6 冊が見出しだけ変えて 2 回並ぶ（2026-09-10 まで）。
 *
 * ## 判定は本編だけで行う（2026-09-10 運営者判断）
 *
 * 仕様書は「omni・quick・para・final がすべて一致したときだけ同一」としていたが、
 * 実データでは本編が同じ段階でも para（並行して進める本）は全段階で違っていた
 * （本そのものが違う段階もあれば、メモの一言だけ違う段階もある）。para まで比べると
 * まとまる段階が 0 件になり、重複が解消しない。そこで
 *
 *   - 本編（トラックのオブジェクト全体。omni / quick のほか note なども含む）が
 *     キー順を除いて完全一致したトラックを 1 グループにする
 *   - para / final はグループの中でさらに「中身が同じトラック」ごとに分けて持つ
 *     （同じなら 1 つ、違えばトラックごとに出せる）
 *
 * とした。alts の順序違いも不一致として扱う（保守的に。まとめすぎるより安全）。
 *
 * @param {object} node   routes.json の ROUTES[tier]
 * @param {string[]} [only] 使うトラックを絞る（大学別ページで選べない科目を外すとき）
 * @returns {{ keys: string[], seq: object,
 *             para: {keys: string[], list: object[]}[],
 *             final: {keys: string[], list: object[]}[] }[]}
 *   keys はまとめたトラック（1 つのときは単独）。並びは TRACK_ORDER の先頭で決まる。
 */
export function groupTracks(node, only) {
  const keys = trackKeys(node).filter(k => !only || only.includes(k));
  const groups = [];
  for (const k of keys) {
    const s = sig(node[k]);
    let g = groups.find(x => x.sig === s);
    if (!g) { g = { sig: s, keys: [], seq: node[k] }; groups.push(g); }
    g.keys.push(k);
  }
  return groups.map(g => {
    const out = { keys: g.keys, seq: g.seq };
    for (const kind of ['para', 'final']) {
      const subs = [];
      for (const k of g.keys) {
        const list = sideListOf(node, kind, k);
        if (!list.length) continue;
        const s = sig(list);
        let sub = subs.find(x => x.sig === s);
        if (!sub) { sub = { sig: s, keys: [], list }; subs.push(sub); }
        sub.keys.push(k);
      }
      out[kind] = subs.map(x => ({ keys: x.keys, list: x.list }));
    }
    return out;
  });
}
