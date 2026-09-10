/**
 * 志望レベル（routes.json の tiers）を科目をまたいで扱う道具。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSubjectData } from './load-subject-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * 「1 つ手前」の志望レベルを飛ばす先。
 *
 * 志望レベルは d.tiers の並び（no の昇順）で難しくなるが、医学部系は並びの直前が
 * 最難関国立（top）になっている。top のルートは医学部より難しい本から始まることがあり、
 * 「ここより前」の案内先としては遠すぎるので、地方旧帝（kyutei）へ戻す。
 */
const PREV_OVERRIDE = { med: 'kyutei', shiritsui: 'kyutei' };

/**
 * その科目で 1 つ手前の志望レベルを返す。無ければ null（共通テスト対策など）。
 *
 * @param {string} dir     科目ディレクトリ名
 * @param {string} tierId
 * @returns {object|null}  tiers の 1 要素
 */
export function prevTierOf(dir, tierId) {
  const list = loadSubjectData(ROOT, dir).tiers || [];
  const want = PREV_OVERRIDE[tierId];
  if (want) {
    const t = list.find(x => x.id === want);
    if (t) return t;
  }
  const i = list.findIndex(x => x.id === tierId);
  return i > 0 ? list[i - 1] : null;
}
