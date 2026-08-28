/**
 * 生成ページで共有する HTML パーツ（head・ヘッダー・フッター）。
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { SUBJECTS, ORIGIN, X_HANDLE, esc, affiliateEnabled } from './extract.mjs';
import { ADSENSE, adsenseLoader } from './ads.mjs';

/**
 * アフィリエイト ID が設定されているか。未設定のうちは広告表記を出さない
 * （未参加の状態で参加者の表記を出さないため）。ID を入れて再生成すれば戻る。
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AFF = affiliateEnabled(ROOT);

/**
 * <head> の共通部分。
 * @param {object} o title/desc/url/ogImage/subject(色用)/noindex/jsonLd
 */
export function head(o) {
  const img = o.ogImage || `${ORIGIN}/assets/ogp.png`;
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<meta name="robots" content="${o.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large,max-snippet:-1'}">
<meta name="theme-color" content="#F6F4EF">
<meta name="format-detection" content="telephone=no">
<link rel="canonical" href="${o.url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="ルート大全">
<meta property="og:locale" content="ja_JP">
<meta property="og:title" content="${esc(o.ogTitle || o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${o.url}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@${X_HANDLE}">
<meta name="twitter:title" content="${esc(o.ogTitle || o.title)}">
<meta name="twitter:description" content="${esc(o.desc)}">
<meta name="twitter:image" content="${img}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://images-fe.ssl-images-amazon.com">
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=Shippori+Mincho+B1:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/js/search.js" defer></script>
${analytics()}${adsenseLoader() ? '\n' + adsenseLoader() : ''}`;
}

/**
 * Google アナリティクス 4。
 * 手書き HTML（ポータル・科目トップ・404）にも同じ測定 ID を直接書いてある。
 * ID を変えるときは `rg G-DQ5WFXEFMX` で全箇所を出してから直す。
 */
export function analytics() {
  const id = 'G-DQ5WFXEFMX';
  return `<!-- Google アナリティクス 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');
</` + `script>`;
}

/**
 * ページ最上部の広告表記。掲載しているものだけを名指しする。
 * アフィリエイトも AdSense も無い状態では出さない（未参加の表記を出さないため）。
 */
function prBarText() {
  const aff = AFF
    ? '<b>アフィリエイト広告</b>を利用しています。参考書の紹介リンクから購入された場合、当サイトに紹介料が発生することがあります。'
    : '';
  const ads = ADSENSE
    ? `${AFF ? 'また、' : ''}Google AdSense による<b>第三者配信の広告</b>を掲載することがあります。`
    : '';
  if (!aff && !ads) return '';
  return `<div class="pr-bar">当サイトは${aff}${ads}</div>\n\n`;
}

/** 広告表示バー（ID 設定時のみ）+ 科目切り替えバー */
export function topBars(curDir) {
  const links = SUBJECTS.map(s =>
    `      <a class="xl" href="/${s.dir}/"${s.dir === curDir ? ' aria-current="page"' : ''}>${s.ja}</a>`
  ).join('\n');
  const pr = prBarText();
  return `${pr}<nav class="xbar" aria-label="科目切り替え">
  <div class="xbar__in">
    <a class="xbar__brand" href="/">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      ルート大全
    </a>
${links}
  </div>
</nav>`;
}

/** 科目色を帯びたヘッダー */
export function header(sub) {
  return `<header class="app-header">
  <div class="app-header__in">
    <a class="logo" href="/${sub.dir}/">
      <div class="logo__mark">${sub.mark}</div>
      <div class="logo__txt"><b>${sub.full}</b><span>${sub.en} ROUTE</span></div>
    </a>
    <div class="rt-search" id="rtSearch" style="min-height:38px">
      <div class="rt-search__in">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.2-3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="search" id="rtSearchInput" placeholder="参考書名で検索（全5科目）" autocomplete="off" spellcheck="false" role="combobox" aria-label="参考書を検索" aria-controls="rtSearchPop" aria-expanded="false" aria-autocomplete="list">
      </div>
      <div class="rt-search__pop" id="rtSearchPop" role="listbox" aria-label="検索候補"></div>
    </div>
    <div class="hdr-cta">
      <a href="/${sub.dir}/#catalog">参考書図鑑</a>
      <a href="/">全科目</a>
      <a class="primary" href="/${sub.dir}/#route">ルートを作る</a>
    </div>
  </div>
</header>`;
}

/** 科目に属さないページ（全科目共通の記事など）のヘッダー */
export function portalHeader() {
  return `<header class="app-header">
  <div class="app-header__in">
    <a class="logo" href="/">
      <div class="logo__mark">全</div>
      <div class="logo__txt"><b>ルート大全</b><span>ROUTE COMPENDIUM</span></div>
    </a>
    <div class="rt-search" id="rtSearch" style="min-height:38px">
      <div class="rt-search__in">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.2-3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="search" id="rtSearchInput" placeholder="参考書名で検索（全5科目）" autocomplete="off" spellcheck="false" role="combobox" aria-label="参考書を検索" aria-controls="rtSearchPop" aria-expanded="false" aria-autocomplete="list">
      </div>
      <div class="rt-search__pop" id="rtSearchPop" role="listbox" aria-label="検索候補"></div>
    </div>
    <div class="hdr-cta"><a href="/#subjects">科目から選ぶ</a><a class="primary" href="/">トップへ</a></div>
  </div>
</header>`;
}

/**
 * ページをそのまま共有する帯。X への投稿とリンクのコピーだけを置く。
 *
 * 生成ページは静的なので、共有するものは「今見ている URL」で決まりきっている。
 * 科目トップの共有（assets/js/share.js）が回答や設定を URL に載せるのとは別物なので、
 * ここでは共通スクリプトを読まず、この帯ぶんの短い処理をページに直接置く。
 *
 * 押した人がそのまま投稿できる状態にしたいので、本文・共有 URL・ハッシュタグは
 * すべて text= に入れて改行の位置まで固定する。intent の url= は本文の末尾に
 * 半角スペースで連結されるため、ハッシュタグとリンクが同じ行に並んでしまう。
 * 宛先も twitter.com/intent/tweet ではなく現行の x.com/intent/post を直接叩く。
 * 転送を 1 回挟むと、スマホで X アプリが開くときに text= が落ちることがある。
 * ここは assets/js/share.js の intentURL() と同じ組み立てにしてある。
 *
 * @param {object} o url: 共有する URL / text: X に載せる本文（URL とタグは足さない） / head: 帯の見出し
 */
export function shareBar(o) {
  const text = `${o.text}\n\n${o.url}\n\n#ルート大全 #大学受験`;
  const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&via=${X_HANDLE}`;
  return `<div class="sharebar">
    <span class="sharebar__t">${esc(o.head)}</span>
    <a class="sharebar__b" href="${esc(x)}" target="_blank" rel="noopener noreferrer">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-7 8 8.2 12h-6.4l-5-7.3L5.9 22H2.8l7.5-8.6L2.4 2h6.6l4.5 6.6L18.9 2Zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20Z"/></svg>
      Xで共有</a>
    <button class="sharebar__b" type="button" data-rt-copy="${esc(o.url)}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 9h10v10H9zM5 15H4V4h11v1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      リンクをコピー</button>
    <span class="sharebar__msg" role="status"></span>
  </div>
  <script>
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-rt-copy]") : null;
    if (!b) return;
    var msg = b.parentNode.querySelector(".sharebar__msg");
    var show = function (t) {
      if (!msg) return;
      msg.textContent = t;
      setTimeout(function () { msg.textContent = ""; }, 2000);
    };
    try {
      navigator.clipboard.writeText(b.dataset.rtCopy).then(
        function () { show("コピーしました"); },
        function () { show("コピーできませんでした"); }
      );
    } catch (err) { show("コピーできませんでした"); }
  });
  </` + `script>`;
}

/** パンくず（表示用）。JSON-LD 側は各ページで別に組む */
export function crumbs(items) {
  const parts = items.map((it, i) => {
    const last = i === items.length - 1;
    const node = last ? `<b>${esc(it.name)}</b>` : `<a href="${it.url}">${esc(it.name)}</a>`;
    return (i ? '<span class="sep">/</span>' : '') + node;
  }).join('\n    ');
  return `<nav class="crumbs" aria-label="パンくずリスト">\n    ${parts}\n  </nav>`;
}

/** フッター。counts は {dir: 冊数} */
export function footer(curDir, counts) {
  const items = SUBJECTS.map(s =>
    `      <a href="/${s.dir}/" style="--fsc:${s.color}"${s.dir === curDir ? ' aria-current="page"' : ''}>
        <span class="fs-mark">${s.mark}</span>
        <span class="fs-txt"><b>${s.full}</b><span>${counts[s.dir]} BOOKS</span></span>
      </a>`
  ).join('\n');
  return `<footer class="site-foot">
  <div class="site-foot__in">
    <div class="foot-subjects__t">Other subjects — 他の科目もあります</div>
    <div class="foot-subjects__list">
${items}
    </div>
    <div class="foot-links">
      <a href="/">ルート大全 トップ</a>
${curDir ? `      <a href="/${curDir}/">参考書図鑑</a>
      <a href="/${curDir}/books/">参考書一覧</a>
      <a href="/${curDir}/routes/">志望校別ルート</a>
      <a href="/${curDir}/guides/">参考書の選び方</a>` : `      <a href="/#subjects">科目から選ぶ</a>
      <a href="/#catalog">参考書から探す</a>
      <a href="/guides/">参考書の選び方</a>`}
      <a href="/#faq">よくある質問</a>
      <a href="https://x.com/${X_HANDLE}" target="_blank" rel="noopener noreferrer me">X @${X_HANDLE}</a>
    </div>
    <div class="foot-legal">
      <b>ルート大全</b> — 大学受験 参考書ルート&amp;図鑑<br>
      ${AFF ? '当サイトはアフィリエイト広告を利用しています。' : ''}掲載している難易度・到達偏差値・想定学習時間は公開情報にもとづく目安であり、学習成果を保証するものではありません。書影は Amazon 等が提供する商品画像 URL を参照して表示しています。<br>
      &copy; ${new Date().getFullYear()} ルート大全 編集部
    </div>
  </div>
</footer>`;
}

/** JSON-LD の script タグ（終了タグは分割して埋め込み事故を防ぐ） */
export function jsonLd(data) {
  return `<script type="application/ld+json">\n${JSON.stringify(data, null, 1)}\n</` + `script>`;
}

/** パンくずの JSON-LD */
export function breadcrumbLd(items, id) {
  return {
    '@type': 'BreadcrumbList',
    '@id': id,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it.name, item: it.absUrl,
    })),
  };
}
