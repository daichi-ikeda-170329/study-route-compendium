/**
 * 大学ごとのおすすめ参考書（大学別ページと書籍ページの両方が使う）。
 *
 * build/generate-universities.mjs にあった pickBooks をここへ移した（2026-11-20）。
 * 書籍ページの「この本をすすめている大学」は、大学別ページと同じ選び方の逆引きでないと、
 * 大学ページには出ているのに書籍ページからは辿れない（またはその逆）が起きるため。
 */
import fs from 'node:fs';
import path from 'node:path';
import { SUBJECTS } from './extract.mjs';
import { trackKeys, groupTracks, trackLabel } from './tracks.mjs';
import { loadSubjectData } from './load-subject-data.mjs';
import { matchFeatures, recommendBooks, availableTracks } from './uni-picks.mjs';

/** 1 科目あたりに出すおすすめ参考書の上限（トラックを分けないとき） */
export const MAX_BOOKS_PER_SUBJECT = 6;
/** トラック（文系・理系、物理・化学…）ごとに分けて出すときの 1 トラックあたりの上限 */
export const MAX_BOOKS_PER_TRACK = 4;

/**
 * 志望レベルのルートに載っている本の中から、**その大学の出題に噛み合うもの**を選ぶ。
 *
 * 選び方の中身は build/lib/uni-picks.mjs にある。ここでは
 *   1. その大学で選べる科目だけにトラックを絞り（理科の地学が不可、社会の倫理が不可など）
 *   2. 出題説明から特徴語を取り出し
 *   3. 特徴・`BOOKS[].unis` のタグ・目標偏差値でスコアを付けて上位を取る
 * という順で呼ぶ。
 *
 * **ルート上の枠（志望校の過去問）は入れない。** 特定の商品ではないうえ、
 * このページには大学名の入った過去問の節を別に置いてある。
 */
export function pickBooks(d, sub, u, tierId, isMed) {
  const allTracks = trackKeys(d.routes[tierId]);

  const { keep, limited } = availableTracks(sub.dir, u, allTracks);
  const features = matchFeatures(sub.dir, uniText(u));
  const groups = groupTracks(d.routes[tierId], keep);

  /* 本編が同じトラックしか無いなら 1 つのリスト。
     違うトラックが 2 つ以上あるなら、トラック（のグループ）ごとに分けて出す。
     2026-09-10 まで 1 つのリストに混ぜていたため、文系プラチカと理系プラチカが並び、
     読者がどちらを取るべきか分からなかった */
  if (groups.length < 2) {
    const books = recommendBooks({
      d, uni: u, tierId, tracks: keep, features, isMed, max: MAX_BOOKS_PER_SUBJECT,
    });
    return { lists: [{ keys: keep, label: '', limited: false, books }], tracks: keep, allTracks, limited, features };
  }

  // 「学部・入試方式による」トラックは末尾に回す
  const isLimited = (g) => g.keys.every(k => limited.includes(k));
  const ordered = [...groups.filter(g => !isLimited(g)), ...groups.filter(isLimited)];
  const shown = new Map();   // 本の id → 最初に出したリストの項目
  const lists = ordered.map(g => {
    const label = g.keys.map(k => trackLabel(d, k)).join('・');
    // 他のトラックで出した本を飛ばしても 4 冊埋まるよう、多めに取ってから詰める
    const all = recommendBooks({
      d, uni: u, tierId, tracks: g.keys, features, isMed, max: MAX_BOOKS_PER_TRACK * 3,
    });
    const books = [];
    for (const b of all) {
      if (books.length >= MAX_BOOKS_PER_TRACK) break;
      const first = shown.get(b.book.id);
      // 複数のトラックに載る本は最初のトラックにだけ出し、「〜でも使う」と添える
      if (first) { first.also.push(label); continue; }
      const item = { ...b, also: [] };
      books.push(item);
      shown.set(b.book.id, item);
    }
    return { keys: g.keys, label, limited: isLimited(g), books };
  });
  return { lists, tracks: keep, allTracks, limited, features };
}

/** 特徴語を探す対象。**データにある文字列だけ**を連結する（推測を混ぜない） */
export function uniText(u) {
  return [u.no, u.time, u.fix, u.med, u.bun, ...(u.fx || [])].filter(Boolean).join(' ');
}


/** 医学部医学科の条件を持つ大学か（大学別ページの medicalInfo と同じ判定） */
export function isMedUniversity(perSubject) {
  const sc = perSubject.find(p => p.sub.dir === 'science');
  return Boolean((sc && sc.u.med) || perSubject.some(p => p.u.t === 'med' || p.u.t === 'shiritsui'));
}

/**
 * 書籍 → その本を大学別ページですすめている大学 の逆引き。
 * キーは `${科目}:${書籍id}`、値は { slug, name, tier, tierNo } の配列（大学別ページの並びと同じ選び方）。
 */
export function bookUniversityIndex(ROOT) {
  const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'data', 'university-slugs.json'), 'utf8'));
  const subs = SUBJECTS.filter(s => !s.catalogOnly);
  const data = Object.fromEntries(subs.map(s => [s.dir, loadSubjectData(ROOT, s.dir)]));
  const index = new Map();
  for (const row of ledger.universities) {
    const perSubject = [];
    for (const sub of subs) {
      const u = data[sub.dir].unis.find(x => x.n === row.name);
      const tier = u && data[sub.dir].tiers.find(t => t.id === u.t);
      if (u && tier) perSubject.push({ sub, u, tier });
    }
    if (perSubject.length !== subs.length) continue;
    const med = isMedUniversity(perSubject);
    for (const p of perSubject) {
      const { lists } = pickBooks(data[p.sub.dir], p.sub, p.u, p.u.t, med);
      for (const l of lists) for (const b of l.books) {
        const key = `${p.sub.dir}:${b.book.id}`;
        const arr = index.get(key) || [];
        if (!arr.some(x => x.slug === row.slug)) arr.push({ slug: row.slug, name: row.name, tier: p.tier.name, tierNo: Number(p.tier.no) || 99 });
        index.set(key, arr);
      }
    }
  }
  return index;
}
