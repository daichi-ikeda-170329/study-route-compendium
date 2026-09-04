/**
 * 参考書 1 冊ごとの詳細ページを生成する。
 *
 *   node build/generate-books.mjs              全科目・全冊
 *   node build/generate-books.mjs math         数学だけ
 *   node build/generate-books.mjs math aochart 数学の 1 冊だけ（パイロット確認用）
 *
 * 出力先は <科目>/books/<id>/index.html。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SUBJECTS, SUB_LABELS, ORIGIN, esc, clip } from './lib/extract.mjs';
import { loadSubjectData } from './lib/load-subject-data.mjs';
import { head, topBars, header, crumbs, footer, jsonLd, breadcrumbLd } from './lib/parts.mjs';
import { authorsOf, searchName, withAuthor } from './lib/booktitle.mjs';
import { coverSrcs } from './lib/cover.mjs';
import { bookCards } from './lib/cards.mjs';
import { adUnit } from './lib/ads.mjs';
import { isProvisional, PROVISIONAL_LABEL } from './lib/newbooks.mjs';
import { byDifficultyAsc } from './lib/rank.mjs';
import { nextStages } from './lib/flow.mjs';
import { seriesOf, hensachiPlain } from './lib/series.mjs';
import { degreeTable, bandOf } from './lib/scale.mjs';
import { recordDate, saveDates } from './lib/updated.mjs';
import { isPlaceholder, PLACEHOLDER_NOTE, PLACEHOLDER_LABEL, placeholderSearchUrl } from './lib/record-type.mjs';
import { verificationOf, verificationRows, STATUS_LABEL } from './lib/verification.mjs';
import { bookIndexable, NOINDEX_META } from './lib/indexing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [onlyDir, onlyId] = process.argv.slice(2);

/* ============================================================
   文章生成のためのヘルパー
   ============================================================ */

/** 難易度 1〜10 を、受験生が自分と照らせる言葉にする */
function diffPhrase(d) {
  if (d <= 2) return { band: '教科書・導入レベル', text: '教科書の内容そのものが不安な段階から使える難易度' };
  if (d <= 4) return { band: '基礎固めレベル', text: '教科書の内容を一通り終えた人が、入試に向けて基礎を固める難易度' };
  if (d <= 6) return { band: '入試標準レベル', text: '共通テストから中堅〜難関私大・地方国公立で問われる標準的な難易度' };
  if (d <= 8) return { band: '難関大レベル', text: '難関国公立・上位私大の入試問題に対応する難易度' };
  return { band: '最難関レベル', text: '最難関大の入試で差がつく問題に対応する、到達点として設定される難易度' };
}

/**
 * 同じ役割の中でこの本がどのあたりに位置するかを、収録データから数えて 1 文にする。
 *
 * ここを「難易度は 10 段階中 7。到達目安は 60〜70。想定学習時間は 40〜55h」と
 * 書くと、すぐ上のスペック表を文章で言い直しているだけになる。同じ役割の
 * 何冊の中のどこか、は表に無い情報で、しかも本ごとに変わる。
 */
function positionSentence(book, books, st, fieldName) {
  const peers = books.filter(b => !isProvisional(b) && b.stage === book.stage
    && (book.sub ? b.sub === book.sub : true));
  if (peers.length < 4) return '';
  const lower = peers.filter(b => b.diff < book.diff).length;
  const ratio = lower / (peers.length - 1);
  const where = ratio < 0.25 ? 'もっともやさしい側'
    : ratio < 0.45 ? 'やさしいほう'
      : ratio < 0.6 ? '中ほど'
        : ratio < 0.8 ? '難しいほう'
          : 'もっとも難しい側';
  return `${fieldName}の「${st.label}」には ${peers.length} 冊を収録しています。`
    + `難易度 ${book.diff} の${book.name}は、そのうち${where}にあたります`
    + `（この役割で難易度が ${book.diff} より下の本は ${lower} 冊）。`;
}

/** 同じ役割・近い難易度の本（横の選択肢） */
function pickAlternatives(book, books, max = 6) {
  // 難易度を持たない本は、近さを測れないので横にも縦にも並べない。
  // NaN 比較で暗黙に空になるが、意図として明示しておく
  if (isProvisional(book)) return [];
  return books
    .filter(b => !isProvisional(b) && b.id !== book.id && b.stage === book.stage
      && (book.sub ? b.sub === book.sub : true)
      && Math.abs(b.diff - book.diff) <= 1)
    .sort((a, b) => Math.abs(a.diff - book.diff) - Math.abs(b.diff - book.diff) || byDifficultyAsc(a, b))
    .slice(0, max);
}

/**
 * この本のあとに進む本（縦の接続）。
 * 同じ役割の上位と、次の段階の本を並べる。
 * 「同じレベルの選択肢」として既に出した本は、重複を避けるため除外する。
 */
function pickNext(book, books, stages, exclude, dir, max = 6) {
  if (isProvisional(book)) return { list: [], kind: 'same' };
  const skip = new Set([book.id, ...exclude.map(b => b.id)]);
  const sameRole = books
    .filter(b => !isProvisional(b) && !skip.has(b.id) && b.stage === book.stage
      && (book.sub ? b.sub === book.sub : true) && b.diff > book.diff)
    .sort(byDifficultyAsc)
    .slice(0, 3);

  // 次の段階は build/lib/flow.mjs が持つ接続表に限る。
  // STAGES の並び順で「自分より後ろ」を全部拾うと、英文解釈のページに英作文が
  // 並ぶような役割の飛びが出る（解釈 → 英作文は積み上げの順序ではない）。
  // 1 つの役割で枠を埋めきらないよう、役割ごとに 2 冊までにする。
  const allowed = nextStages(dir, book.stage);
  const byStage = new Map();
  books
    .filter(b => !isProvisional(b) && !skip.has(b.id) && allowed.includes(b.stage)
      && (book.sub ? b.sub === book.sub : true) && b.diff >= book.diff)
    .sort(byDifficultyAsc)
    .forEach(b => {
      const arr = byStage.get(b.stage) || [];
      if (arr.length < 2) { arr.push(b); byStage.set(b.stage, arr); }
    });
  const later = allowed
    .flatMap(k => byStage.get(k) || [])
    .slice(0, max - sameRole.length);

  const kind = sameRole.length && later.length ? 'mixed' : later.length ? 'later' : 'same';
  return { list: [...sameRole, ...later].slice(0, max), kind };
}

function amazonUrl(b, tag) {
  // ルート上の枠（志望校の過去問など）は特定の商品ではない。/dp/ の直リンクを
  // 出すと、志望校が違う利用者を別大学の 1 冊へ送ってしまう
  if (isPlaceholder(b)) {
    const base = placeholderSearchUrl(b.official || b.name);
    return tag ? `${base}&tag=${tag}` : base;
  }
  const key = b.isbn10 || b.asin;
  const q = encodeURIComponent(b.official || b.name);
  const base = key
    ? `https://www.amazon.co.jp/dp/${key}/ref=nosim`
    : `https://www.amazon.co.jp/s?k=${q}`;
  if (!tag) return base;
  return base + (key ? `?tag=${tag}` : `&tag=${tag}`);
}

/**
 * 楽天アフィリエイトのリンク。科目トップの rakutenURL() と同じ形にそろえる。
 * 遷移先は最後に一度だけエンコードする（内側でもエンコードすると二重になり、
 * 楽天側で検索語が復元できずヒットしなくなる）。
 *
 * **遷移先は商品ページではなく ISBN の検索結果ページ。**楽天ブックスの商品 URL
 * （books.rakuten.co.jp/rb/<商品ID>/）に入っているのは楽天内部の商品 ID で、
 * ISBN からは作れない。対応表は楽天ブックス系 API（アプリ ID の登録が要る）
 * でしか取れず、このリポジトリはアプリ ID を持っていない。
 * 楽天のアプリ登録は IP アドレスの許可制で、GitHub Actions の実行 IP を
 * 登録しきれないため見送っている（経緯は docs/new-books-plan.md の 3 節）。
 * ボタンの文言を「楽天ブックスで検索」にして、遷移先と表示を一致させてある。
 * 商品 ID を引けるようにしたら、ここと科目トップの rakutenURL() の両方を直す。
 */
function rakutenUrl(b, id) {
  if (!id) return '';
  // 枠は ISBN を持たない。書名そのままの検索結果へ送る
  const dest = `https://search.rakuten.co.jp/search/mall/${isPlaceholder(b) ? b.name : (b.isbn13 || b.name)}/`;
  const e = encodeURIComponent(dest);
  return `https://hb.afl.rakuten.co.jp/hgc/${id}/?pc=${e}&m=${e}`;
}

/* ============================================================
   1 冊分のページ
   ============================================================ */
function renderBook(book, ctx) {
  const { sub, books, stages, counts, config } = ctx;
  const st = stages[book.stage] || { label: '', short: '', color: sub.color };
  const subLabel = book.sub ? (SUB_LABELS[book.sub] || '') : '';

  // 新刊は現物を読んでいないので難易度・到達目安・強み・注意点・向いている人を持たない。
  // diffPhrase に undefined を通すと比較が全部 false になり「最難関レベル」に化けるので、
  // 難易度に触る処理はすべてこのフラグで分岐する（docs/new-books-plan.md の 7 節）
  const prov = isProvisional(book);
  const dp = prov ? { band: '', text: '' } : diffPhrase(book.diff);
  // レベル別に複数の巻をまとめている本。難易度の数字を単独で読ませないための注記を出す
  const series = prov ? null : seriesOf(book);
  const url = `${ORIGIN}/${sub.dir}/books/${book.id}/`;
  // 更新日はレコードの中身が変わった日。科目 HTML を 1 文字直しただけで
  // その科目の全ページの日付が動かないよう、git の日付ではなくハッシュで見る
  const updated = recordDate(`${sub.dir}/${book.id}`, book);
  const alts = pickAlternatives(book, books);
  const next = pickNext(book, books, stages, alts, sub.dir);
  const covers = coverSrcs(book);
  const az = amazonUrl(book, config.amazonTag);
  const rk = rakutenUrl(book, config.rakutenId);
  // 広告リンクかどうかは販売サイトごとに違う。ID が入っている側だけ
  // rel="sponsored" を付け、もう一方はタグ無しの通常リンクとして扱う。
  const affAz = Boolean(config.amazonTag);
  const affRk = Boolean(config.rakutenId);
  const aff = affAz || affRk;
  /* 外部の販売サイトへ出るリンク。target="_blank" を使うので noopener は必須。
     noreferrer も付ける（どのページから来たかを販売サイトへ渡さない。
     アフィリエイトの計測は URL の tag= と経路 ID で行われるので影響しない）。
     広告リンクであることは sponsored で示す。ID が入っている側だけに付ける */
  const relAz = affAz ? 'nofollow sponsored noopener noreferrer' : 'nofollow noopener noreferrer';
  const relRk = 'nofollow sponsored noopener noreferrer';
  const affStores = [affAz ? 'Amazon' : null, affRk ? '楽天ブックス' : null].filter(Boolean).join('・');

  const fieldName = subLabel ? `${sub.ja}（${subLabel}）` : sub.ja;
  const position = prov ? '' : positionSentence(book, books, st, fieldName);

  // 検索されるときの書名。内部略称の本は正式名称由来に、著者名が
  // 書名の一部として通っている本（「関正生の英文法ポラリス」など）は著者名込みにする。
  const authors = authorsOf(sub.dir, book.id);
  const pageName = searchName(book, sub.dir);
  const searchTitle = withAuthor(book, sub.dir);

  // 同じ書名の本が科目内に複数ある（日本史版と世界史版、河合と駿台の同名問題集など）と
  // title が衝突し、検索結果で区別できなくなる。分野で分かれるなら分野名を、
  // それでも同じなら出版社を添えて一意にする。
  const collisions = books.filter(b => withAuthor(b, sub.dir) === searchTitle);
  const sameSub = collisions.filter(b => (SUB_LABELS[b.sub] || '') === subLabel).length;
  const titleName = collisions.length === 1 ? searchTitle
    : subLabel && sameSub === 1 ? `${searchTitle}（${subLabel}）`
      : `${searchTitle}（${book.pub}）`;

  // 書名が長い本は副題を削る。検索結果は全角 30 字ほどで切られるので、
  // 副題を並べると書名の後ろが読めないまま尻切れになる。
  // 評価が未了の本に「難易度・対象・次に進む本」と書くと、ページに無いものを
  // title で約束することになる。検索結果から来た読者の期待を外すので分ける
  const titleTail = prov ? '｜新刊・書誌情報'
    : titleName.length > 20 ? '｜レベルと使い方' : 'のレベルと使い方｜難易度・対象・次に進む本';
  const title = `${titleName}${titleTail} - ${sub.full}`;
  const by = authors.length ? `${authors.join('・')}／` : '';
  // meta description は 120 字以内。本文の頭を写すのではなく、検索結果で
  // 「自分に関係あるか」を判断できる要素（役割・難易度・向く人）だけを並べる。
  const desc = clip(prov
    ? `${pageName}（${by}${book.pub}）の書誌情報。${fieldName}の${st.label}に置かれる新刊で、難易度と到達目安は評価準備中です。`
    : `${pageName}（${by}${book.pub}）のレベルと使い方。${fieldName}の${st.label}、難易度${book.diff}/10、到達目安${hensachiPlain(book)}。${book.bestFor}向け。`, 120);

  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: sub.full, url: `/${sub.dir}/`, absUrl: `${ORIGIN}/${sub.dir}/` },
    { name: '参考書一覧', url: `/${sub.dir}/books/`, absUrl: `${ORIGIN}/${sub.dir}/books/` },
    { name: pageName, url, absUrl: url },
  ];

  // 枠には Book を出さない。ISBN も刊行年も持たない「1 冊」を構造化データで
  // 主張すると、検索エンジンに実在しない商品を渡すことになる
  const placeholder = isPlaceholder(book);
  /* 事実として確かめた項目と、編集部が推定した項目を分けて出す。
     verified と「現物を確認した」を同じ意味にしない（build/lib/verification.mjs） */
  const ver = verificationOf(sub.dir, book);
  /* 固有の価値がまだ無いページは検索結果に載せない。既に流入のある URL を
     一律に noindex にはしない（build/lib/indexing.mjs） */
  const idx = bookIndexable(book);
  const bookNode = placeholder ? [] : [
      {
        '@type': 'Book',
        '@id': `${url}#book`,
        name: book.official || book.name,
        alternateName: book.name,
        /* 書誌データベースで実在を確かめられた ISBN だけを出す。
           確かめていない番号を構造化データで主張しない（指示書 14.4） */
        ...(book.isbn13 && ver.fields.isbn13 && ver.fields.isbn13.status === 'verified'
          ? { isbn: book.isbn13 } : {}),
        // 著者は openBD で実在を確認できた本にだけ載せる（build/data/authors.json）
        ...(authors.length
          ? { author: authors.map(name => ({ '@type': 'Person', name })) }
          : {}),
        publisher: { '@type': 'Organization', name: book.pub },
        /* 刊行年が書誌データベースと食い違う本は出さない。版の違いで年がずれることが
           多く、どちらが正しいかを確かめていない段階で片方を主張しない */
        ...(book.year && !(ver.fields.year && ver.fields.year.mismatch)
          ? { datePublished: String(book.year) } : {}),
        inLanguage: 'ja',
        bookFormat: 'https://schema.org/Paperback',
        about: `大学受験 ${fieldName}`,
        url,
      },
  ];

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      ...bookNode,
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url, name: title, description: desc, inLanguage: 'ja',
        dateModified: updated,
        isPartOf: { '@id': `${ORIGIN}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
        ...(placeholder ? {} : { mainEntity: { '@id': `${url}#book` } }),
      },
    ],
  };

  const meter = Array.from({ length: 10 }, (_, i) =>
    `<i class="${!prov && i < book.diff ? 'on' : ''}"></i>`).join('');

  const spec = [
    ...(authors.length ? [['著者', esc(authors.join('・'))]] : []),
    ['出版社', esc(book.pub)],
    ['出版年', placeholder ? '志望校・年度による' : (book.year ? `${book.year} 年` : '—')],
    ['対象範囲', esc(book.subjects || '—')],
    ['役割', esc(st.label || '—')],
    ['難易度', prov ? `<span class="bk-prov">${esc(PROVISIONAL_LABEL)}</span>`
      : `${book.diff} / 10（${bandOf(book.diff)}）${series ? `<br><small style="color:var(--muted)">${esc(series.label)}の全体の目安</small>` : ''}`],
    ['到達目安', prov ? '評価準備中'
      : `${esc(hensachiPlain(book) || '—')}<br><small style="color:var(--muted)">全統記述模試の換算</small>`],
    ['問題数・構成', esc(book.problems || '—')],
    ['想定学習時間', esc(book.hours || '—')],
    ['形式', esc(book.style || '—')],
    ['ISBN', placeholder ? '—（特定の商品ではありません）'
      : book.isbn13 ? `<span class="mono">${esc(book.isbn13)}</span>` : '—'],
  ].map(([k, v]) => `      <div><dt>${k}</dt><dd>${v}</dd></div>`).join('\n');

  const nextLead = next.kind === 'same'
    ? `${book.name}を終えたあと、同じ「${st.label}」の枠内でもう一段レベルを上げるなら、次の参考書が候補になります。`
    : next.kind === 'later'
      ? `${book.name}のあとは次の段階に進みます。${fieldName}のルートでは、以下が接続先の候補です。`
      : `${book.name}のあとの候補です。同じ「${st.label}」でレベルを上げる道と、次の段階へ進む道の両方を並べています。どちらを選ぶかは、この本の内容がどこまで身についたかで決めてください。`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc, url, ogImage: `${ORIGIN}/assets/ogp/${sub.dir}/${book.id}.png` })}${idx.indexable ? '' : `
<!-- ${idx.reason}。評価を書けば自動で index へ戻る（build/lib/indexing.mjs） -->
${NOINDEX_META}`}
<style>:root{--sc:${st.color || sub.color}}</style>
</head>
<body>

${topBars(sub.dir)}

${header(sub)}

<main class="wrap wrap--read">
  ${crumbs(crumbItems)}

  <article>
    <div class="bk-hero">
      <div class="bk-cover">
        <div class="ph"><b>${esc(book.name)}</b><span>${esc(book.pub)}</span></div>
        ${covers.length ? `<img src="${esc(covers[0])}" alt="${esc(book.name)}の表紙" width="186" height="260" loading="eager" referrerpolicy="no-referrer" data-srcs="${esc(covers.join('|'))}" data-s="0" onload="if(this.naturalWidth&lt;=1)this.onerror()" onerror="var s=this.dataset.srcs.split('|'),n=+this.dataset.s+1;if(s.length&gt;n){this.dataset.s=n;this.src=s[n]}else{this.remove()}">` : ''}
      </div>
      <div>
        <span class="bk-tag"><i></i>${esc(st.label)}${subLabel ? ` — ${esc(subLabel)}` : ''}</span>
        <h1 class="bk-name">${esc(searchTitle)}</h1>
        <p class="bk-official">${esc(book.official || book.name)}／${by ? `${esc(authors.join('・'))}／` : ''}${esc(book.pub)}${book.year ? `（${book.year} 年）` : ''}</p>
        <p class="page-updated">最終更新: <time datetime="${updated}">${updated}</time></p>
        <p class="bk-desc">${prov
    ? `${esc(book.pub)}から刊行された新刊です。現物の確認が済んでいないため、難易度と到達目安の評価は準備中です。`
    : esc(book.desc)}</p>
        ${prov ? `<div class="bk-provbox">
          <b>${esc(PROVISIONAL_LABEL)}</b>
          <span>掲載しているのは書誌情報と役割だけです。難易度・到達目安・強み・注意点は、現物を確認してから追記します。推測では書きません。</span>
        </div>` : `<div class="bk-meter">
          <div class="bk-meter__t"><span>難易度</span><b>${book.diff} <small style="font-size:11px;color:var(--muted)">/ 10</small></b></div>
          <div class="bk-meter__bar">${meter}</div>
        </div>${series ? `<div class="bk-series"><b>${esc(series.label)}</b> — ${esc(series.note)}</div>` : ''}`}
      </div>
    </div>

    <section class="block">
      <div class="eyebrow">Specs</div>
      <h2 class="sec">基本情報</h2>
      <div class="spec">
        <dl>
${spec}
        </dl>
      </div>
      <p class="spec__note">書名・出版社・ISBN・刊行年・問題数は公開されている書誌情報です。難易度・到達目安・想定学習時間は編集部の推定値で、<a href="/methodology/">算出方法</a>を公開しています。</p>

      <div class="verif" data-status="${ver.status}">
        <p class="verif__t"><b>この情報の確かめ方</b><span class="verif__badge">${esc(STATUS_LABEL[ver.status])}</span></p>
        <dl class="verif__rows">
${verificationRows(ver).map(([k, v]) => `          <div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n')}
        </dl>
${ver.sources.length ? `        <p class="verif__src">出典: ${ver.sources.map(x => `<a href="${esc(x.url)}" rel="nofollow noopener noreferrer" target="_blank">書誌データベース</a>`)[0]}（${esc(ver.sources[0].checkedAt || '確認日未記録')}）</p>` : ''}
        <p class="verif__note">「確認済み」は公開されている書誌情報と一致したという意味で、<b>編集部が現物を確認したという意味ではありません</b>。判定の基準は<a href="/methodology/">算出方法</a>に書いています。</p>
      </div>
    </section>

    ${prov ? `<section class="block prose">
      <div class="eyebrow">Status</div>
      <h2 class="sec">この本の評価について</h2>
      <p>${esc(book.name)}は${esc(st.label)}に位置づけられる${esc(fieldName)}の参考書です。${book.year ? `${book.year} 年の刊行で、` : ''}掲載したばかりのため、難易度・到達目安・強み・注意点・向いている人はまだ書いていません。</p>
      <p>このサイトの難易度は 10 段階で、収録している ${sub.full}の参考書すべてを同じ物差しで並べています。現物を確認しないまま数字を置くと、その物差し自体が狂います。${esc(book.name)}についても、確認が済んでから追記します。</p>
      <p>いま分かっているのは、下の基本情報に載せた書誌情報と、${esc(st.label)}という役割だけです。志望校から逆算した参考書ルートは、評価が済んだ本だけで組んでいます。${sub.full}の<a href="/${sub.dir}/" style="color:var(--indigo);font-weight:700">ルート画面</a>をご覧ください。</p>
    </section>${adUnit('inArticle')}` : `<section class="block prose">
      <div class="eyebrow">Who is it for</div>
      <h2 class="sec">どんな人に向いているか</h2>
      <p><b>${esc(book.bestFor)}</b>に向いた一冊です。</p>
      ${position ? `<p>${esc(position)}</p>` : ''}
      ${series ? `<p>${esc(series.note)}</p>` : ''}
      ${degreeTable({ current: book.diff })}
    </section>${adUnit('inArticle')}

    <div class="pc-grid">
      <div class="pc good">
        <h3><i><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></i>強み</h3>
        <ul>
${(book.pros || []).map(p => `          <li>${esc(p)}</li>`).join('\n')}
        </ul>
      </div>
      <div class="pc care">
        <h3><i><svg viewBox="0 0 24 24" fill="none"><path d="M12 8v5m0 3.5v.5" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke-width="1.9"/></svg></i>注意点</h3>
        <ul>
${(book.cons || []).map(c => `          <li>${esc(c)}</li>`).join('\n')}
        </ul>
      </div>
    </div>`}

    ${book.unis && book.unis.length ? `<div class="note">
      <h3>この本が視野に入る志望校</h3>
      <p>${book.unis.map(u => esc(u)).join(' ／ ')}<br>
      あくまで「このレベルの本を使う人が多い層」の目安です。同じ大学でも学部・方式で必要な到達点は変わります。${sub.full}の<a href="/${sub.dir}/" style="color:var(--indigo);font-weight:700">ルート画面</a>で志望校名を直接入れると、出題形式に合わせた並びが出ます。</p>
    </div>` : ''}

    ${alts.length ? `<section class="block">
      <div class="eyebrow">Alternatives</div>
      <h2 class="sec">同じ役割・同じレベルの参考書</h2>
      <p class="sec-lead">${esc(book.name)}と同じ「${esc(st.label)}」の枠で、難易度が近い参考書です。相性で選んで構いません。ここから 1 冊を選び切ることが大切で、複数を並行させる必要はありません。</p>
${bookCards(alts, sub, stages)}
    </section>` : ''}

    ${next.list.length ? `<section class="block">
      <div class="eyebrow">Next step</div>
      <h2 class="sec">この本のあとに進む参考書</h2>
      <p class="sec-lead">${esc(nextLead)}</p>
${bookCards(next.list, sub, stages)}
    </section>` : ''}

    <section class="block">
      <div class="eyebrow">Where to buy</div>
      <h2 class="sec">購入する</h2>
      <div class="buy">
        <a class="az" href="${esc(az)}" target="_blank" rel="${relAz}" data-rt-buy="amazon" data-rt-bid="${book.id}" data-rt-sub="${sub.dir}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 4h5v16H6a1 1 0 0 1-1-1V4Zm9 0h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4V4Z" stroke-width="1.9" stroke-linejoin="round"/></svg>
          ${placeholder ? '志望校の過去問題集を検索' : 'Amazon で見る'}
        </a>
        ${rk ? `<a class="rk" href="${esc(rk)}" target="_blank" rel="${relRk}" data-rt-buy="rakuten" data-rt-bid="${book.id}" data-rt-sub="${sub.dir}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 4h5v16H6a1 1 0 0 1-1-1V4Zm9 0h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4V4Z" stroke-width="1.9" stroke-linejoin="round"/></svg>
          楽天ブックスで検索
        </a>` : ''}
      </div>
      <script>
      /* 購入リンクのクリックを記録する。どの本が実際に踏まれたかを書籍単位で見るため。
         **送信は assets/js/analytics.js の allowlist を必ず通す**（gtag をここから
         直接呼ばない。許可していない値が外へ出る道を残さないため）。
         計測の失敗でリンクの遷移を止めないよう、全体を try で囲う。 */
      document.addEventListener("click", function (e) {
        var a = e.target.closest ? e.target.closest("[data-rt-buy]") : null;
        if (!a) return;
        try {
          if (window.RTAnalytics) window.RTAnalytics.track("affiliate_click", {
            store: a.getAttribute("data-rt-buy"),
            book_id: a.getAttribute("data-rt-bid"),
            subject_id: a.getAttribute("data-rt-sub")
          });
        } catch (err) { /* 計測の失敗で購入導線を止めない */ }
      });
      </script>
      ${placeholder ? `<p class="buy__note buy__note--warn"><b>${esc(PLACEHOLDER_LABEL)}。</b>${esc(PLACEHOLDER_NOTE)}</p>` : ''}
      <p class="buy__note">${aff ? `${affStores}へのリンクは広告リンクです。リンク経由で購入された場合、当サイトに紹介料が発生することがあります。紹介料の有無によって掲載順や評価を変えることはありません。` : ''}価格と在庫は変動するため、購入時は販売サイトの表示をご確認ください。改訂版が出ている場合があります。版を確認してから購入してください。</p>
    </section>

    <div class="cta">
      <h2>${esc(book.name)}は、あなたのルートの何冊目か</h2>
      <p>1 冊単位で選ぶより、志望校までの並びの中で位置を決めたほうが迷いません。${esc(sub.full)}では、志望校と現在地から ${counts[sub.dir]} 冊の中を通る道を組み立てられます。</p>
      <div class="cta__btns">
        <a class="p" href="/${sub.dir}/">${esc(sub.ja)}のルートを作る<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
        <a class="g" href="/">全科目を見る</a>
      </div>
    </div>${adUnit('bottom')}
  </article>
</main>

${footer(sub.dir, counts)}

${jsonLd(ld)}

</body>
</html>
`;
}

/* ============================================================
   実行
   ============================================================ */
const data = {};
const counts = {};
for (const s of SUBJECTS) {
  data[s.dir] = loadSubjectData(ROOT, s.dir);
  counts[s.dir] = data[s.dir].books.length;
}

let written = 0;
const targets = onlyDir ? SUBJECTS.filter(s => s.dir === onlyDir) : SUBJECTS;
if (onlyDir && targets.length === 0) {
  console.error(`科目 "${onlyDir}" は存在しない。指定できるのは: ${SUBJECTS.map(s => s.dir).join(', ')}`);
  process.exit(1);
}

for (const sub of targets) {
  const d = data[sub.dir];
  const config = d.config;
  const list = onlyId ? d.books.filter(b => b.id === onlyId) : d.books;
  if (onlyId && list.length === 0) {
    console.error(`${sub.dir}: id "${onlyId}" が見つからない`);
    process.exit(1);
  }
  for (const book of list) {
    const outDir = path.join(ROOT, sub.dir, 'books', book.id);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'),
      renderBook(book, { sub, books: d.books, stages: d.stages, counts, config }));
    written++;
  }
  console.log(`  ✓ ${sub.dir}: ${list.length} ページ`);
}
saveDates();
console.log(`合計 ${written} ページを生成した。`);

/*
 * ここには以前 extractConfig() があり、科目 HTML を正規表現で読んで
 * アフィリエイト ID を取っていた。
 *
 *     const m = src.match(new RegExp(`${key}:\\s*"([^"]*)"`));
 *
 * CONFIG を HTML の外へ出すと何にもマッチしなくなり、**例外も警告も出さずに空文字**に
 * なる。その結果、購入リンクから tag= と経路 ID が消え、rel="sponsored" と
 * 広告リンクの注記も消えた（2026-09-05 に joho の移行で実際に起きた）。
 * いまは loadSubjectData() の config を使う。**ここに正規表現で読む実装を戻さない。**
 * test/affiliate-disclosure.test.mjs の「購入リンク」の検査が固定している。
 */
