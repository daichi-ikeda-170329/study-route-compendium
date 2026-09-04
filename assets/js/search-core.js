/**
 * 詳細検索の絞り込みそのもの。**画面には触らない。**
 *
 * ここを画面から切り離してあるのは、規則を Node のテストで固定するため
 * （`test/search-facets.test.mjs`）。表示の都合で規則が変わっていくのを防ぐ。
 *
 * ## 欠損の扱い — ここがいちばん大事
 *
 * 著者・難易度・刊行年が分からない本がある（著者は 1,390 冊中 1,048 冊が不明）。
 *
 *   - **その項目で絞り込んでいないときは、欠損している本も結果に含める。**
 *     「著者を指定していない」は「著者が分かっている本だけ見たい」ではない。
 *   - 欠損だけを見たいときのために `unknown` を選べるようにする。
 *   - **欠損を「該当なし」に分類しない。** 表示は「不明・確認中」と書き分ける。
 *
 * 推測で埋めることは絶対にしない。分からないものは分からないまま数える。
 */
(function (global) {
  'use strict';

  /** 欠損を選ぶときの値。実在の出版社名や著者名と衝突しない形にする */
  var UNKNOWN = '__unknown__';

  /** 絞り込みの初期値。空配列＝その項目では絞らない */
  function emptyQuery() {
    return {
      q: '',
      subjects: [], publishers: [], authors: [],
      stages: [], diffBands: [], yearBands: [], statuses: [],
    };
  }

  /** 検索語の正規化。全角・半角と大文字・小文字の違いを吸収する */
  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[\s　・･,，、.。！!？?（）()［］\[\]「」『』【】〜~\-—―_/／]/g, '');
  }

  /**
   * 1 つの項目の判定。
   * @param {string[]} selected 選ばれている値。空なら絞らない（**欠損も含める**）
   * @param {*} value その本の値。null / 空配列なら欠損
   */
  function matchOne(selected, value) {
    if (!selected || !selected.length) return true;   // 絞っていない → 欠損も通す
    var missing = value === null || value === undefined || value === ''
      || (Array.isArray(value) && value.length === 0);
    if (missing) return selected.indexOf(UNKNOWN) >= 0;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) if (selected.indexOf(value[i]) >= 0) return true;
      return false;
    }
    return selected.indexOf(value) >= 0;
  }

  /**
   * 索引を絞り込む。
   * @param {object} index generate-search-facets.mjs が作った v2 索引
   * @param {object} query
   * @returns {{books:Array, total:number, unknownCounts:object}}
   */
  function filterBooks(index, query) {
    var q = Object.assign(emptyQuery(), query || {});
    var needle = norm(q.q);
    var subjectIds = (index.subjects || []).map(function (s) { return s.id; });

    var out = [];
    for (var i = 0; i < index.books.length; i++) {
      var b = index.books[i];

      if (needle) {
        var hay = norm(b.n) + norm(b.pub) + norm((b.au || []).join('')) + norm(b.id);
        if (hay.indexOf(needle) < 0) continue;
      }
      if (!matchOne(q.subjects, subjectIds[b.s])) continue;
      if (!matchOne(q.publishers, b.pub)) continue;
      if (!matchOne(q.authors, b.au)) continue;
      if (!matchOne(q.stages, b.stage)) continue;
      if (!matchOne(q.diffBands, b.db)) continue;
      if (!matchOne(q.yearBands, b.yb)) continue;
      if (!matchOne(q.statuses, b.vs)) continue;

      out.push(b);
    }

    return {
      books: out,
      total: index.books.length,
      unknownCounts: {
        publishers: out.filter(function (b) { return !b.pub; }).length,
        authors: out.filter(function (b) { return !b.au || !b.au.length; }).length,
        diffBands: out.filter(function (b) { return !b.db; }).length,
        yearBands: out.filter(function (b) { return !b.yb; }).length,
      },
    };
  }

  /**
   * 並べ替え。**同じ入力なら必ず同じ順になる。**
   * 欠損は末尾へ送る（先頭に来ると「不明の本ばかり」に見える）。
   */
  function sortBooks(books, mode) {
    var arr = books.slice();
    var byName = function (a, b) { return String(a.n).localeCompare(String(b.n), 'ja'); };
    if (mode === 'name') return arr.sort(byName);
    if (mode === 'year') {
      return arr.sort(function (a, b) {
        if ((a.year === null) !== (b.year === null)) return a.year === null ? 1 : -1;
        if (a.year !== b.year) return b.year - a.year;
        return byName(a, b);
      });
    }
    // 既定は難易度順。難易度を持たない本は末尾
    return arr.sort(function (a, b) {
      if ((a.diff === null) !== (b.diff === null)) return a.diff === null ? 1 : -1;
      if (a.diff !== b.diff) return a.diff - b.diff;
      return byName(a, b);
    });
  }

  var RTSearchCore = {
    UNKNOWN: UNKNOWN,
    emptyQuery: emptyQuery,
    norm: norm,
    matchOne: matchOne,
    filterBooks: filterBooks,
    sortBooks: sortBooks,
  };

  global.RTSearchCore = RTSearchCore;
  if (typeof module !== 'undefined' && module.exports) module.exports = RTSearchCore;
})(typeof window !== 'undefined' ? window : globalThis);
