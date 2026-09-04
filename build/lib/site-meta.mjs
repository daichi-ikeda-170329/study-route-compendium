/**
 * 年度表記と件数の単位の正本。
 *
 * 「2026年度入試対応」のような年度コピーは、手書きの index.html と 7 科目トップ、
 * 生成ページ、JSON-LD、FAQ、方法論、OGP のあいだに散っていた。1 か所を直しても
 * 残りが古いまま公開されるので、値は build/data/site-meta.json だけに置き、
 * 表示に使う文言はここで組み立てる。
 *
 * 年度を上げるときは site-meta.json の admissionYear だけを変え、
 * `node build/apply-site-meta.mjs` を流す。--check で差分検査だけもできる。
 *
 * **「完全対応」と書かない。** 全件を確認し終えた事実が無いため、標準表記は
 * 「順次確認・更新中」にしてある（指示書 3 節・7.1 節）。年度と新課程も
 * 別の話なので、同義に扱わない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** site-meta.json の生の中身 */
export const SITE_META = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'build', 'data', 'site-meta.json'), 'utf8')
);

export const ADMISSION_YEAR = SITE_META.admissionYear;
export const CURRICULUM_LABEL = SITE_META.curriculumLabel;
export const COUNT_UNIT = SITE_META.countUnitLabel;

/** ヘッダーの小さなタグ・ヒーローのバッジに出す標準表記 */
export const ADMISSION_LABEL = SITE_META.admissionLabel;
/** 幅の狭い場所で使う短い版 */
export const ADMISSION_LABEL_SHORT = SITE_META.admissionLabelShort;

/**
 * meta description / og:description の末尾に付ける一文。
 * 「◯◯年度入試対応・完全無料」を置き換える。断定しない表現にしてある。
 */
export const ADMISSION_META_SENTENCE = `${ADMISSION_YEAR}年度に向けて更新中・完全無料。`;

/**
 * 件数の表示。**公開表示の単位は「冊」に統一する。**
 * 内部のデータ検証やコードでは record と呼んでよいが、利用者が見る場所では言い換えない。
 * @param {number} n
 */
export function books(n) {
  return `${n.toLocaleString('en-US')}${COUNT_UNIT}`;
}

/**
 * 「2027年度入試に向けて順次確認・更新中」の説明本文。FAQ や方法論で使う。
 */
export function admissionParagraph() {
  return `掲載内容は${ADMISSION_YEAR}年度入試に向けて順次確認・更新しています。`
    + `全ページの${ADMISSION_YEAR}年度対応を確認し終えた状態ではないため、`
    + `「完全対応」とは書いていません。出願要項・出題範囲は必ず大学の公式発表で確認してください。`;
}

/**
 * 公開 HTML に残っていてはいけない年度コピーの検出パターン。
 * apply-site-meta.mjs とテストの両方から使う（同じ規則を 2 か所に書かないため）。
 * 書名・刊行年・更新履歴は対象外にするため、「入試対応」など文脈語まで含めて拾う。
 */
export const STALE_YEAR_PATTERNS = [
  /(20\d\d)\s*年度入試対応/g,
  /(20\d\d)\s*入試対応/g,
  /(20\d\d)\s*共テ[^<"]{0,12}対応/g,
  /(20\d\d)\s*共通テスト[^<"]{0,12}対応/g,
  /(20\d\d)\s*年度完全対応/g,
  /(20\d\d)\s*年度の新課程には対応していますか/g,
];

/** 誇張表現。年度に限らず「完全対応」「完全網羅」の類は使わない */
export const OVERCLAIM_PATTERNS = [
  /年度完全対応/g,
  /完全対応/g,
];
