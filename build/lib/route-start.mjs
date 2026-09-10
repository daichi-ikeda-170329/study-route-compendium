/**
 * ルートの「始まり」を説明する道具。
 *
 * 2026-09-10 まで、志望校別ルートのリード文は全段階で「導入から過去問まで」と書いていた。
 * ところが早慶・最難関のルートは難易度 5 の文法書から始まり、導入の段を持たない。
 * 基礎から始めたい読者に「ここより前」が示されないまま、いきなり難しい本を渡していた。
 *
 *   firstStageLabel()  ルートの最初の段の名前（リード文の「〜から過去問まで」）
 *   beforeRoute()      先頭の本が難しいときの「ここより前の段階」の案内
 */
import { esc } from './extract.mjs';
import { prevTierOf } from './tiers.mjs';
import { trackKeys } from './tracks.mjs';

/** 先頭の本がこの難易度以上なら「ここより前の段階」を案内する */
export const HARD_START = 4;

/** 「ここより前」で手前のルートから挙げる本の上限と、前半とみなす lvl の上限 */
const PREV_BOOKS_MAX = 3;
const PREV_LVL_MAX = 1;

/**
 * ルートの最初の段の名前。
 *
 * 先頭の本が易しい（難易度 2 以下）か、ルート上の役割・段の名前に「導入」を含むなら
 * 「導入」を返す。それ以外はその本の段（stages.json の label）を返す。
 *
 * @param {{omni?: object[]}} seq  トラックの本編
 * @param {object} d              loadSubjectData の戻り
 */
export function firstStageLabel(seq, d) {
  const first = seq && seq.omni && seq.omni[0];
  if (!first) return '導入';
  const book = d.books.find(b => b.id === first.id);
  const stage = book && d.stages[book.stage];
  if (!book || !stage) return '導入';
  if ((typeof book.diff === 'number' && book.diff <= 2)
    || /導入/.test(first.role || '') || /導入/.test(stage.label || '')) return '導入';
  return stage.label;
}

/**
 * 先頭の本が難しいルートに付ける「ここより前の段階」の案内。要らなければ null。
 *
 * @param {object} d        loadSubjectData の戻り
 * @param {string} tierId   このルートの志望レベル
 * @param {{keys: string[], seq: object}} group  groupTracks の 1 要素
 * @returns {null|{book: object, stage: object, prevTier: object, prevBooks: object[]}}
 */
export function beforeRoute(d, tierId, group) {
  const first = group.seq && group.seq.omni && group.seq.omni[0];
  const book = first && d.books.find(b => b.id === first.id);
  if (!book || typeof book.diff !== 'number' || book.diff < HARD_START) return null;
  const prevTier = prevTierOf(d.dir, tierId);
  if (!prevTier) return null;

  /* 手前のルートの同じトラック（無ければ最初のトラック）の本編から、前半の本を拾う。
     **このルート自身に載っている本と、先頭の本より難しい本は挙げない。**
     社会では手前のルートの前半に同じシリーズの後ろの巻（実況中継③④）が入っていて、
     そのまま挙げると「①から始まるルートの前に③を」という逆転した案内になる */
  const here = new Set([...(group.seq.omni || []), ...(group.seq.quick || [])].map(s => s.id));
  const node = d.routes[prevTier.id] || {};
  const key = group.keys.find(k => node[k]) || trackKeys(node)[0];
  const omni = (key && node[key] && node[key].omni) || [];
  const prevBooks = omni
    .filter(s => typeof s.lvl === 'number' && s.lvl <= PREV_LVL_MAX && !here.has(s.id))
    .map(s => d.books.find(b => b.id === s.id))
    .filter(b => b && b.recordType !== 'routePlaceholder' && typeof b.diff === 'number' && b.diff < book.diff)
    .slice(0, PREV_BOOKS_MAX);
  if (!prevBooks.length) return null;
  return { book, stage: d.stages[book.stage] || {}, prevTier, prevBooks };
}

/**
 * 「ここより前の段階」の文面（HTML）。ルートページと大学別ページで同じ文にする。
 *
 * @param {object} d       loadSubjectData の戻り
 * @param {object} group   groupTracks の 1 要素
 * @param {object} before  beforeRoute の戻り（null でないこと）
 */
export function beforeSentence(d, group, before) {
  const link = (b) => `<a href="/${d.dir}/books/${b.id}/">${esc(b.name)}</a>`;
  // 導入書そのものが難しい場合、「導入をまだ固めていない」とは書けない
  const cond = firstStageLabel(group.seq, d) === '導入'
    ? 'この難易度から入るのが重いと感じる場合は'
    : `${esc(before.stage.label || '')}をまだ固めていない場合は`;
  return `このルートは${link(before.book)}（難易度 ${before.book.diff}）から始まります。${cond}、`
    + `${esc(before.prevTier.name)}のルートの前半（${before.prevBooks.map(link).join('、')}）を先に終えてください。`;
}
