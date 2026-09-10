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
