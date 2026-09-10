/**
 * 大学別ページの出典（build/data/university-sources.json）の読み口と検査。
 *
 * 大学別ページの出題形式の説明には、根拠の年度も出典も書いていなかった（2026-09-10 まで）。
 * 大学ごとに「どの年度の要項を、いつ、どこで確かめたか」を持ち、ページに出典として出す。
 *
 * 形（キーは build/data/university-slugs.json の slug）:
 *
 *   {
 *     "schemaVersion": 1,
 *     "universities": {
 *       "waseda": {
 *         "year": 2027,                 必須。確かめた入学者選抜要項の対象年度
 *         "checked": "2026-09-10",      必須。確かめた日
 *         "url": "https://...",         必須。大学公式の入試情報のページ
 *         "faculties": [                任意。学部×方式の表
 *           { "name": "法学部", "method": "一般選抜", "subjects": "...", "note": "...", "source": "https://..." }
 *         ]
 *       }
 *     }
 *   }
 *
 * **確かめていない大学は書かない。** 書いていない大学のページは「募集要項で確認してください」
 * とだけ出す。年度や URL を推測で埋めない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SOURCES_FILE = path.join(ROOT, 'build', 'data', 'university-sources.json');

/** 出典の台帳を読む。無ければ空（まだ 1 校も登録していない状態として扱う） */
export function loadUniversitySources(file = SOURCES_FILE) {
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (raw && raw.universities) || {};
}

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isHttps = (s) => typeof s === 'string' && /^https:\/\/[^\s]+$/.test(s);

/**
 * 形と slug の実在を検査する。問題の一覧を返す（空なら合格）。
 *
 * @param {object} raw     JSON.parse した university-sources.json 全体
 * @param {Set<string>} slugs  university-slugs.json にある slug
 */
export function validateUniversitySources(raw, slugs) {
  const problems = [];
  const bad = (m) => problems.push(`university-sources.json: ${m}`);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { bad('トップレベルがオブジェクトでない'); return problems; }
  if (raw.schemaVersion !== 1) bad(`schemaVersion が ${JSON.stringify(raw.schemaVersion)}。想定は 1`);
  const unis = raw.universities;
  if (!unis || typeof unis !== 'object' || Array.isArray(unis)) { bad('universities がオブジェクトでない'); return problems; }

  for (const [slug, u] of Object.entries(unis)) {
    if (!slugs.has(slug)) bad(`「${slug}」は build/data/university-slugs.json に無い`);
    if (!u || typeof u !== 'object') { bad(`${slug}: オブジェクトでない`); continue; }
    if (!Number.isInteger(u.year) || u.year < 2000 || u.year > 2100) bad(`${slug}.year: 西暦の整数が要る（${JSON.stringify(u.year)}）`);
    if (!isDate(u.checked)) bad(`${slug}.checked: YYYY-MM-DD の日付が要る（${JSON.stringify(u.checked)}）`);
    if (!isHttps(u.url)) bad(`${slug}.url: https の URL が要る（${JSON.stringify(u.url)}）`);
    if (u.faculties !== undefined) {
      if (!Array.isArray(u.faculties)) { bad(`${slug}.faculties: 配列でない`); continue; }
      u.faculties.forEach((f, i) => {
        const at = `${slug}.faculties[${i}]`;
        for (const k of ['name', 'method', 'subjects']) {
          if (typeof f[k] !== 'string' || !f[k]) bad(`${at}.${k}: 空か文字列でない`);
        }
        if (f.note !== undefined && (typeof f.note !== 'string' || !f.note)) bad(`${at}.note: 書くなら空でない文字列`);
        if (f.source !== undefined && !isHttps(f.source)) bad(`${at}.source: https の URL が要る`);
        if (f.slug !== undefined && !/^[a-z0-9-]+$/.test(f.slug)) bad(`${at}.slug: 英数小文字とハイフンだけ`);
        if (f.focus !== undefined && (typeof f.focus !== 'object' || Array.isArray(f.focus))) bad(`${at}.focus: 科目→重点キーの配列のオブジェクトが要る`);
      });
      const fslugs = u.faculties.map(f => f.slug).filter(Boolean);
      if (new Set(fslugs).size !== fslugs.length) bad(`${slug}.faculties: slug が重複している`);
    }
  }
  return problems;
}
