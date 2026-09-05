/**
 * 書影の候補 URL を決める**唯一の場所**。
 *
 * もとは `build/lib/cover.mjs` と各科目の描画コードに同じような関数が 2 つあり、
 * **中身が食い違っていた**（生成側は Amazon → 国立国会図書館サーチ → openBD の
 * 4 候補、科目トップ側は Amazon の 2 候補だけ）。同じ本なのに、書籍ページでは
 * 表紙が出て科目トップでは出ない、という差が生まれていた。
 * ここに 1 本化して、両方から読む。
 *
 * ## 取得元は policy で決める
 *
 * `build/data/cover-provider-policies.json` の `enabled` が false の provider は
 * 候補に入れない。`enabled` は「いま実際に参照しているか」であって、
 * **利用条件を確認したという意味ではない**（確認状況は `termsReviewed`）。
 * 詳しくは `docs/cover-policy.md`。
 *
 * ## 1x1 画像のこと
 *
 * Amazon は画像を持たない ISBN に 43 バイトほどの 1x1 画像を HTTP 200 で返す。
 * `onerror` は発火しないので、表示側が `naturalWidth <= 1` を見て次の候補へ送る。
 * 書名だけを刷った自動生成画像を返す場合はそれにも掛からないので、
 * その本は `BOOKS[].nocover` で候補を空にする。
 *
 * ## 枠に添える見本の書影
 *
 * ルート上の枠（`recordType: 'routePlaceholder'`）は特定の商品ではないので ISBN も
 * `cover` も持たない。それでも一覧やルートに 1 枚も画像が無いと、そこだけ代替表示に
 * なって浮く。`BOOKS[].coverExample` は**その枠がどんな本を指すかを示す見本**で、
 * 購入リンクや JSON-LD には一切影響しない。
 */
(function (global) {
  'use strict';

  /**
   * provider ごとの候補 URL の作り方。
   *
   * **並びは社会の科目トップが持っていた順をそのまま採った。** 7 科目のうち
   * いちばん候補が多く、ほかの科目の候補をすべて含んでいたため、この順にすると
   * **どの科目でも候補が減らない**（減ると、いま表紙が出ている本が出なくなる）。
   * 逆に、これまで Amazon の 2 候補しか試していなかった科目（数学・情報・小論文）は
   * 候補が増えるので、表紙が出る本が増えることはあっても減ることはない。
   */
  var BUILDERS = {
    explicit: function (b) {
      // cover は「その本そのもの」の書影。coverExample は**ルート上の枠に添える見本**で、
      // 枠は特定の商品ではないので cover を持てない（build/lib/record-type.mjs）。
      // 見本であることは alt と枠の注意書きで伝える。
      if (b.cover) return [b.cover];
      return b.coverExample ? [b.coverExample] : [];
    },
    amazon: function (b) {
      var key = b.isbn10 || b.asin;
      if (!key) return [];
      return [
        'https://images-fe.ssl-images-amazon.com/images/P/' + key + '.09.LZZZZZZZ.jpg',
        'https://images-na.ssl-images-amazon.com/images/P/' + key + '.09.LZZZZZZZ.jpg',
        'https://m.media-amazon.com/images/P/' + key + '.09.LZZZZZZZ.jpg',
        'https://images-fe.ssl-images-amazon.com/images/P/' + key + '.01.LZZZZZZZ.jpg',
        'https://images-na.ssl-images-amazon.com/images/P/' + key + '.01.LZZZZZZZ.jpg',
      ];
    },
    gakusan: function (b) {
      return b.isbn13 ? ['https://www.gakusan.com/bookimage/' + b.isbn13 + '.jpg'] : [];
    },
    ndl: function (b) {
      return b.isbn13 ? ['https://ndlsearch.ndl.go.jp/thumbnail/' + b.isbn13 + '.jpg'] : [];
    },
    googlebooks: function (b) {
      return b.isbn13
        ? ['https://books.google.com/books/content?vid=ISBN' + b.isbn13 + '&printsec=frontcover&img=1&zoom=1']
        : [];
    },
    openbd: function (b) {
      return b.isbn13 ? ['https://cover.openbd.jp/' + b.isbn13 + '.jpg'] : [];
    },
    gakusanSmall: function (b) {
      return b.isbn13 ? ['https://www.gakusan.com/bookimage_s/' + b.isbn13 + '.jpg'] : [];
    },
  };

  /** 試す順。個別指定を先に置く（取れないと分かって指定したものなので） */
  var ORDER = ['explicit', 'amazon', 'gakusan', 'ndl', 'googlebooks', 'openbd', 'gakusanSmall'];

  function isEnabled(policies, id) {
    if (!policies || !policies.providers) return true;   // policy を渡さなければ全部使う
    var p = policies.providers[id];
    return Boolean(p && p.enabled);
  }

  /**
   * 候補 URL を優先順に返す。
   * @param {object} b BOOKS の 1 冊
   * @param {object} [policies] cover-provider-policies.json の中身
   */
  function coverSrcs(b, policies) {
    if (!b || b.nocover) return [];
    var out = [];
    for (var i = 0; i < ORDER.length; i++) {
      var id = ORDER[i];
      if (!isEnabled(policies, id)) continue;
      var urls = BUILDERS[id](b);
      for (var j = 0; j < urls.length; j++) if (out.indexOf(urls[j]) < 0) out.push(urls[j]);
    }
    return out;
  }

  /** URL がどの provider のものかを返す。分からなければ 'unknown' */
  function providerOf(url, policies) {
    var u = String(url || '');
    var providers = (policies && policies.providers) || {};
    var ids = Object.keys(providers);
    for (var i = 0; i < ids.length; i++) {
      var hosts = providers[ids[i]].hostPatterns || [];
      for (var j = 0; j < hosts.length; j++) {
        if (u.indexOf('//' + hosts[j] + '/') >= 0) return ids[i];
      }
    }
    return u ? 'explicit' : 'unknown';
  }

  var RTCoverResolver = {
    ORDER: ORDER,
    coverSrcs: coverSrcs,
    providerOf: providerOf,
  };

  global.RTCoverResolver = RTCoverResolver;
  if (typeof module !== 'undefined' && module.exports) module.exports = RTCoverResolver;
})(typeof window !== 'undefined' ? window : globalThis);
