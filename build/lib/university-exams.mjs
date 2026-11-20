/**
 * 大学別ページの「出題の構成」（build/data/university-exams.json）の読み口と検査。
 *
 * 大学が自ら公表している入試問題・出題の意図だけを根拠に、科目ごとの大問の構成・試験時間・
 * 出題の意図の要約を持つ（2026-11-20〜）。予備校の分析・赤本・受験情報サイトは根拠にしない。
 * 問題文は写さない（構成と、意図の要約だけ）。
 *
 * 形（キーは build/data/university-slugs.json の slug）:
 *
 *   {
 *     "schemaVersion": 1,
 *     "universities": {
 *       "todai": {
 *         "checked": "2026-11-20",
 *         "subjects": {
 *           "english": {
 *             "year": 2026,                  必須。確かめた入試問題の年度
 *             "exam": "前期日程 第2次学力試験", 必須。試験の区分（私立は学部・方式）
 *             "time": "120分",               任意
 *             "parts": ["第1問 …", …],        必須。大問ごとの形式（問題文は写さない）
 *             "trend": "…",                  任意。2 年分以上を確かめたときだけ
 *             "intent": "…",                 任意。大学が公表した出題の意図の要約
 *             "advice": "…",                 任意。構成に対する対策（編集部の推定）
 *             "sources": [{ "label": "…", "url": "https://…" }]  必須。大学公式の URL
 *           }
 *         }
 *       }
 *     }
 *   }
 *
 * 科目キーは english / math / math2（文系と理系で問題が違う大学の 2 つ目）/ japanese。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const EXAMS_FILE = path.join(ROOT, 'build', 'data', 'university-exams.json');
export const EXAM_SUBJECTS = ['english', 'math', 'math2', 'japanese'];
/** 大学別ページの科目の節（dir）への対応 */
export const EXAM_SECTION = { english: 'english', math: 'math', math2: 'math', japanese: 'japanese' };

export function loadUniversityExams(file = EXAMS_FILE) {
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (raw && raw.universities) || {};
}

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isHttps = (s) => typeof s === 'string' && /^https:\/\/[^\s]+$/.test(s);
const str = (s, max) => typeof s === 'string' && s.trim() && s.length <= max;

/** 形と slug の実在を検査する。問題の一覧を返す（空なら合格） */
export function validateUniversityExams(raw, slugs) {
  const problems = [];
  const bad = (m) => problems.push(`university-exams.json: ${m}`);
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 1) { bad('schemaVersion 1 のオブジェクトでない'); return problems; }
  for (const [slug, u] of Object.entries(raw.universities || {})) {
    if (!slugs.has(slug)) bad(`「${slug}」は build/data/university-slugs.json に無い`);
    if (!isDate(u.checked)) bad(`${slug}.checked: YYYY-MM-DD の日付が要る`);
    for (const [k, s] of Object.entries(u.subjects || {})) {
      const at = `${slug}.${k}`;
      if (!EXAM_SUBJECTS.includes(k)) { bad(`${at}: 科目キーは ${EXAM_SUBJECTS.join('・')} のどれか`); continue; }
      if (!Number.isInteger(s.year) || s.year < 2015 || s.year > 2030) bad(`${at}.year: 年度の整数が要る`);
      if (!str(s.exam, 80)) bad(`${at}.exam: 1〜80 字`);
      if (s.time !== undefined && !str(s.time, 40)) bad(`${at}.time: 1〜40 字`);
      if (!Array.isArray(s.parts) || !s.parts.length || s.parts.length > 15 || !s.parts.every(x => str(x, 90))) bad(`${at}.parts: 1〜15 項目、各 90 字まで`);
      for (const f of ['trend', 'intent', 'advice']) if (s[f] !== undefined && !str(s[f], 200)) bad(`${at}.${f}: 書くなら 1〜200 字`);
      if (!Array.isArray(s.sources) || !s.sources.length || !s.sources.every(x => x && str(x.label, 80) && isHttps(x.url))) bad(`${at}.sources: label と https の url の組が 1 つ以上要る`);
    }
  }
  return problems;
}
