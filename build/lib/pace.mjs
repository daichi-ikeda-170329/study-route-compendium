/**
 * 「この本を 1 周するのに、どれくらいの期間がかかるか」。
 *
 * 書籍ページは想定学習時間を「100〜140h」と総時間でしか出していなかった。
 * 受験生が実際に知りたいのは残り期間に入るかどうかで、総時間だけだと毎回
 * 自分で割り算することになる。BOOKS[].hours をそのまま日数に割るだけなので
 * 新しい推定は足していない（**推測で埋めない**）。
 *
 * 1 冊ごとに数字が変わるため、ページをまたいで同じ文にならない。書籍ページの
 * 本文の 78% がページ共通の定型文で、AdSense に「有用性の低いコンテンツ」として
 * 却下された（2026-09-20）ことへの対応でもある。→ build/lib/compare-note.mjs
 *
 * **総時間として読める本にだけ出す。** hours は "100〜140h" が大多数だが、
 * 「随時参照」「通年並行」「辞書的使用」「各巻 20〜30h」のように 1 周する前提でない
 * 書き方も一定数ある。これらに日数を出すと嘘になるので、"N〜Nh" にきれいに
 * 一致するものだけを対象にする。
 */

/** hours が総時間の範囲を表しているときだけ [下限, 上限] を返す */
export function totalHours(book) {
  const m = /^(\d+)〜(\d+)h$/.exec(String(book?.hours || '').trim());
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi < lo) return null;
  return [lo, hi];
}

/** 日数の範囲を、読みやすい単位（日・週間・か月）の文字列にする */
function span(loDays, hiDays) {
  const lo = Math.round(loDays);
  const hi = Math.round(hiDays);
  /* 3 週間までは日で出す。「10〜16 日」を「1〜2 週間」に丸めると、
     残り期間に入るかを判断するのに足りる細かさが消える */
  if (hi < 21) {
    return lo === hi ? `${hi} 日` : `${lo}〜${hi} 日`;
  }
  if (hi < 70) {
    const a = Math.round(lo / 7);
    const b = Math.round(hi / 7);
    return a === b ? `約 ${b} 週間` : `${a}〜${b} 週間`;
  }
  const a = Math.round(lo / 30.4);
  const b = Math.round(hi / 30.4);
  return a === b ? `約 ${b} か月` : `${a}〜${b} か月`;
}

/**
 * 1 日あたりの学習時間ごとの所要期間。
 * 想定時間が短い本（20h 未満）に「1 日 1 時間なら…」を 3 通り並べても
 * 同じ答えばかりになるので、本の重さで刻みを変える。
 */
function paces(lo, hi) {
  const rows = hi >= 60 ? [1, 2, 3] : hi >= 20 ? [1, 2] : [0.5, 1];
  return rows.map(perDay => ({
    perDay,
    label: perDay < 1 ? `1 日 ${Math.round(perDay * 60)} 分` : `1 日 ${perDay} 時間`,
    text: span(lo / perDay, hi / perDay),
  }));
}

/**
 * 書籍ページに出す「1 周の期間」。総時間として読めない本は null。
 * @returns {{lo:number, hi:number, rows:{label:string,text:string}[], sentence:string}|null}
 */
export function pacePlan(book) {
  const t = totalHours(book);
  if (!t) return null;
  const [lo, hi] = t;
  const rows = paces(lo, hi);
  /* 想定学習時間そのものはスペック表に出ているので繰り返さない（docs/style-guide.md）。
     ここで書くのは、表からは読み取れない「何日・何週間・何か月で終わるか」だけ */
  const sentence = rows.map(r => `${r.label}なら ${r.text}`).join('、')
    + 'で 1 周できる計算です。';
  return { lo, hi, rows, sentence };
}
