/**
 * 大学別ページの「実際の出題」（build/data/university-exams.json）の検査。
 * 大学が公表した問題・出題の意図だけを根拠にし、問題文は写さない（build/lib/university-exams.mjs）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const { validateUniversityExams, EXAMS_FILE } = await import('../build/lib/university-exams.mjs');
const slugs = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'build/data/university-slugs.json'), 'utf8')).universities.map(u => u.slug));

const ok = { schemaVersion: 1, universities: { todai: { checked: '2026-11-20', subjects: { english: {
  year: 2026, exam: '前期日程', time: '120分', parts: ['第1問 要約'], sources: [{ label: '問題', url: 'https://www.u-tokyo.ac.jp/x.pdf' }],
} } } } };

test('正しい形なら問題なし', () => {
  assert.deepEqual(validateUniversityExams(ok, slugs), []);
});

test('出典の無い科目・http の出典・未知の科目キーは落とす', () => {
  const noSrc = structuredClone(ok); noSrc.universities.todai.subjects.english.sources = [];
  assert.ok(validateUniversityExams(noSrc, slugs).some(p => /sources/.test(p)));
  const http = structuredClone(ok); http.universities.todai.subjects.english.sources[0].url = 'http://x';
  assert.ok(validateUniversityExams(http, slugs).some(p => /sources/.test(p)));
  const key = structuredClone(ok); key.universities.todai.subjects.physics = key.universities.todai.subjects.english;
  assert.ok(validateUniversityExams(key, slugs).some(p => /科目キー/.test(p)));
});

test('台帳に無い大学は落とす', () => {
  const unknown = { schemaVersion: 1, universities: { 'no-such-univ': ok.universities.todai } };
  assert.ok(validateUniversityExams(unknown, slugs).some(p => /no-such-univ/.test(p)));
});

test('登録済みの台帳は形の検査を通る', () => {
  if (!fs.existsSync(EXAMS_FILE)) return;
  assert.deepEqual(validateUniversityExams(JSON.parse(fs.readFileSync(EXAMS_FILE, 'utf8')), slugs), []);
});
