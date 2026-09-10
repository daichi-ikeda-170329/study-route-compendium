/**
 * 志望レベル（routes.json の tiers）を科目をまたいで扱う道具。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSubjectData } from './load-subject-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * 科目をまたいで共通の「帯」の名前。
 *
 * 志望レベルの表示名は科目ごとにデータとして正しく書き分けてある（sokei は英語「早慶・上智」、
 * 国語「早稲田・上智」、数学「早慶」、理科「早慶理工・上智・理科大」、社会「早稲田・慶應・上智」）。
 * ただ大学別ページの「科目ごとの目標」表に 5 通りが並ぶと不揃いに見えるので、主表示は
 * この帯の名前にそろえ、科目固有の名前は小さく添える（仕様書 2.7）。
 * **全科目の tiers[].id がここに無ければ落とす**（build/lib/validate-subject-data.mjs）。
 */
export const TIER_GROUP = {
  kyote: '共通テスト', nikkoma: '中堅私大', march: '難関私大', chikoku: '地方国公立',
  sokei: '早慶上智', kyutei: '地方旧帝', top: '最難関国立', hitotsubashi: '最難関国立',
  med: '国公立医学部', shiritsui: '私立医学部',
};

/** 帯の名前。未知の id は空文字（呼び出し側で科目固有の名前だけを出す） */
export function tierGroup(tierId) {
  return TIER_GROUP[tierId] || '';
}

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
