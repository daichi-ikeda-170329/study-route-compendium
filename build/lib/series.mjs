/**
 * 複数の巻・レベルを 1 レコードで扱っている本の判定。
 *
 * 「英文法レベル別問題集(1〜6)」「データベース(3300/4800)」のようなシリーズを
 * 1 冊として持つと、難易度の数値がシリーズ全体の代表値になり、そのままでは
 * 「この本は難易度 3」と読まれてしまう（実際は巻によって 2〜7 に散る）。
 *
 * 巻ごとに分割してレコードを作るのが理想だが、巻ごとの ISBN・刊行年・問題数を
 * 現物なしに埋めることになり、このサイトが守っている「確認していない数字を置かない」に
 * 反する。そこで**分割はせず、シリーズであることを表示に出して数値を単独では
 * 読ませない**方針を採る。
 *
 * 判定の根拠は BOOKS[].hensachi の末尾に既に入っている注記で、新しいフィールドは
 * 増やさない。表記は 3 種類ある。
 *
 *   "40〜68(6段階)"   … レベル別に 6 巻ある
 *   "40〜65(2冊構成)" … 2 冊で 1 セット（「3分冊」も同じ扱い）
 *   "45〜65(全レベル)" … 総合英語・辞書のように全レベルで参照する本（「全期間」「通読」も同じ）
 */

const RE_LEVELS = /[(（](\d+)\s*段階[)）]/;
const RE_VOLUMES = /[(（](\d+)\s*(?:冊構成|分冊)[)）]/;
const RE_ALL = /[(（](?:全レベル|全期間|通読)[)）]/;

/**
 * シリーズ・参照系の判定。該当しなければ null。
 * @returns {{kind:'levels'|'volumes'|'reference', count:number|null, label:string, note:string}|null}
 */
export function seriesOf(book) {
  const h = String(book?.hensachi || '');
  const lv = h.match(RE_LEVELS);
  if (lv) {
    return {
      kind: 'levels', count: Number(lv[1]),
      label: `レベル別 ${lv[1]} 巻`,
      note: `この本はレベル別に ${lv[1]} 巻あり、難易度と到達目安はシリーズ全体の範囲です。実際に取り組む巻によって変わります。`,
    };
  }
  const vol = h.match(RE_VOLUMES);
  if (vol) {
    return {
      kind: 'volumes', count: Number(vol[1]),
      label: `${vol[1]} 冊構成`,
      note: `この本は ${vol[1]} 冊で 1 セットです。難易度と到達目安はセット全体の範囲で、どの冊から入るかで変わります。`,
    };
  }
  if (RE_ALL.test(h)) {
    return {
      kind: 'reference', count: null,
      label: '全レベル（調べ先）',
      note: '通読して終える本ではなく、学習中ずっと引き続ける参照用の一冊です。難易度は「どの段階から引けるか」の目安で、到達点を示すものではありません。',
    };
  }
  return null;
}

/** 到達目安から注記を外した数値部分（「40〜68(6段階)」→「40〜68」） */
export function hensachiPlain(book) {
  return String(book?.hensachi || '').replace(/[(（][^()（）]*[)）]\s*$/, '').trim();
}
