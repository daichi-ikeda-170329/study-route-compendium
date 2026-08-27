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
import { extractSubject, SUBJECTS, SUB_LABELS, ORIGIN, esc, clip } from './lib/extract.mjs';
import { head, topBars, header, crumbs, footer, jsonLd, breadcrumbLd } from './lib/parts.mjs';
import { authorsOf, searchName, withAuthor } from './lib/booktitle.mjs';
import { coverSrcs } from './lib/cover.mjs';

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

/** 学習時間の目安から、続けるイメージが持てる一文を作る */
function paceSentence(hours) {
  if (!hours) return '';
  return `想定学習時間の目安は ${hours} です。1 冊を終えるまでの期間は、1 日に確保できる時間で大きく変わります。`;
}

/** stage の並び順（STAGES のキー順＝学習順）から index を引く */
function stageIndex(stages, key) {
  return Object.keys(stages).indexOf(key);
}

/** 同じ役割・近い難易度の本（横の選択肢） */
function pickAlternatives(book, books, max = 6) {
  return books
    .filter(b => b.id !== book.id && b.stage === book.stage
      && (book.sub ? b.sub === book.sub : true)
      && Math.abs(b.diff - book.diff) <= 1)
    .sort((a, b) => Math.abs(a.diff - book.diff) - Math.abs(b.diff - book.diff) || a.diff - b.diff)
    .slice(0, max);
}

/**
 * この本のあとに進む本（縦の接続）。
 * 同じ役割の上位と、次の段階の本を並べる。
 * 「同じレベルの選択肢」として既に出した本は、重複を避けるため除外する。
 */
function pickNext(book, books, stages, exclude, max = 6) {
  const skip = new Set([book.id, ...exclude.map(b => b.id)]);
  const sameRole = books
    .filter(b => !skip.has(b.id) && b.stage === book.stage
      && (book.sub ? b.sub === book.sub : true) && b.diff > book.diff)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 3);

  // 次の段階は、1 つの段階で枠を埋めきらないよう段階ごとに 2 冊までにする。
  // そうしないと「計算練習」のような並行トラックだけが並び、網羅系まで届かない。
  const si = stageIndex(stages, book.stage);
  const byStage = new Map();
  books
    .filter(b => !skip.has(b.id) && stageIndex(stages, b.stage) > si
      && (book.sub ? b.sub === book.sub : true) && b.diff >= book.diff)
    .sort((a, b) => a.diff - b.diff)
    .forEach(b => {
      const arr = byStage.get(b.stage) || [];
      if (arr.length < 2) { arr.push(b); byStage.set(b.stage, arr); }
    });
  const later = [...byStage.entries()]
    .sort((a, b) => stageIndex(stages, a[0]) - stageIndex(stages, b[0]))
    .flatMap(([, arr]) => arr)
    .slice(0, max - sameRole.length);

  const kind = sameRole.length && later.length ? 'mixed' : later.length ? 'later' : 'same';
  return { list: [...sameRole, ...later].slice(0, max), kind };
}

function amazonUrl(b, tag) {
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
 */
function rakutenUrl(b, id) {
  if (!id) return '';
  const dest = `https://search.rakuten.co.jp/search/mall/${b.isbn13 || b.name}/`;
  const e = encodeURIComponent(dest);
  return `https://hb.afl.rakuten.co.jp/hgc/${id}/?pc=${e}&m=${e}`;
}

/* ============================================================
   カード
   ============================================================ */
function bookCard(b, sub, stages) {
  const st = stages[b.stage] || {};
  const bars = Array.from({ length: 10 }, (_, i) =>
    `<i class="${i < b.diff ? 'on' : ''}"></i>`).join('');
  return `      <a class="bcard" href="/${sub.dir}/books/${b.id}/" style="--bc:${st.color || sub.color}">
        <div class="bcard__top"><span class="bcard__stage">${esc(st.short || '')}</span><span>${esc(b.pub)}</span></div>
        <b>${esc(b.name)}</b>
        <p>${esc(clip(b.desc, 68))}</p>
        <div class="bcard__foot"><span class="bcard__diff">${bars}</span><span>難易度 ${b.diff}</span></div>
      </a>`;
}

/* ============================================================
   1 冊分のページ
   ============================================================ */
function renderBook(book, ctx) {
  const { sub, books, stages, counts, config } = ctx;
  const st = stages[book.stage] || { label: '', short: '', color: sub.color };
  const subLabel = book.sub ? (SUB_LABELS[book.sub] || '') : '';
  const dp = diffPhrase(book.diff);
  const url = `${ORIGIN}/${sub.dir}/books/${book.id}/`;
  const alts = pickAlternatives(book, books);
  const next = pickNext(book, books, stages, alts);
  const covers = coverSrcs(book);
  const az = amazonUrl(book, config.amazonTag);
  const rk = rakutenUrl(book, config.rakutenId);
  // 広告リンクかどうかは販売サイトごとに違う。ID が入っている側だけ
  // rel="sponsored" を付け、もう一方はタグ無しの通常リンクとして扱う。
  const affAz = Boolean(config.amazonTag);
  const affRk = Boolean(config.rakutenId);
  const aff = affAz || affRk;
  const relAz = affAz ? 'nofollow sponsored noopener' : 'nofollow noopener';
  const relRk = 'nofollow sponsored noopener';
  const affStores = [affAz ? 'Amazon' : null, affRk ? '楽天ブックス' : null].filter(Boolean).join('・');

  const fieldName = subLabel ? `${sub.ja}（${subLabel}）` : sub.ja;

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
  const titleTail = titleName.length > 20 ? '｜レベルと使い方' : 'のレベルと使い方｜難易度・対象・次に進む本';
  const title = `${titleName}${titleTail} - ${sub.full}`;
  const by = authors.length ? `${authors.join('・')}／` : '';
  const desc = clip(
    `${pageName}（${by}${book.pub}）は${st.label}に位置づけられる${fieldName}の参考書。${dp.band}（難易度${book.diff}/10）、到達目安は${book.hensachi}。` +
    `${book.bestFor}に向いています。強みと注意点、同じレベルの他の選択肢、次に進む参考書までまとめました。`, 158);

  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: sub.full, url: `/${sub.dir}/`, absUrl: `${ORIGIN}/${sub.dir}/` },
    { name: pageName, url, absUrl: url },
  ];

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'Book',
        '@id': `${url}#book`,
        name: book.official || book.name,
        alternateName: book.name,
        ...(book.isbn13 ? { isbn: book.isbn13 } : {}),
        // 著者は openBD で実在を確認できた本にだけ載せる（build/data/authors.json）
        ...(authors.length
          ? { author: authors.map(name => ({ '@type': 'Person', name })) }
          : {}),
        publisher: { '@type': 'Organization', name: book.pub },
        ...(book.year ? { datePublished: String(book.year) } : {}),
        inLanguage: 'ja',
        bookFormat: 'https://schema.org/Paperback',
        about: `大学受験 ${fieldName}`,
        url,
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url, name: title, description: desc, inLanguage: 'ja',
        isPartOf: { '@id': `${ORIGIN}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
        mainEntity: { '@id': `${url}#book` },
      },
    ],
  };

  const meter = Array.from({ length: 10 }, (_, i) =>
    `<i class="${i < book.diff ? 'on' : ''}"></i>`).join('');

  const spec = [
    ...(authors.length ? [['著者', esc(authors.join('・'))]] : []),
    ['出版社', esc(book.pub)],
    ['出版年', book.year ? `${book.year} 年` : '—'],
    ['対象範囲', esc(book.subjects || '—')],
    ['役割', esc(st.label || '—')],
    ['難易度', `${book.diff} / 10（${dp.band}）`],
    ['到達目安', esc(book.hensachi || '—')],
    ['問題数・構成', esc(book.problems || '—')],
    ['想定学習時間', esc(book.hours || '—')],
    ['形式', esc(book.style || '—')],
    ['ISBN', book.isbn13 ? `<span class="mono">${esc(book.isbn13)}</span>` : '—'],
  ].map(([k, v]) => `      <div><dt>${k}</dt><dd>${v}</dd></div>`).join('\n');

  const nextLead = next.kind === 'same'
    ? `${book.name}を終えたあと、同じ「${st.label}」の枠内でもう一段レベルを上げるなら、次の参考書が候補になります。`
    : next.kind === 'later'
      ? `${book.name}のあとは次の段階に進みます。${fieldName}のルートでは、以下が接続先の候補です。`
      : `${book.name}のあとの候補です。同じ「${st.label}」でレベルを上げる道と、次の段階へ進む道の両方を並べています。どちらを選ぶかは、この本の内容がどこまで身についたかで決めてください。`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc, url, ogImage: `${ORIGIN}/assets/ogp-${sub.dir}.png` })}
<style>:root{--sc:${st.color || sub.color}}</style>
</head>
<body>

${topBars(sub.dir)}

${header(sub)}

<main class="wrap">
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
        <p class="bk-desc">${esc(book.desc)}</p>
        <div class="bk-meter">
          <div class="bk-meter__t"><span>難易度</span><b>${book.diff} <small style="font-size:11px;color:var(--muted)">/ 10</small></b></div>
          <div class="bk-meter__bar">${meter}</div>
        </div>
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
    </section>

    <section class="block prose">
      <div class="eyebrow">Who is it for</div>
      <h2 class="sec">どんな人に向いているか</h2>
      <p><b>${esc(book.bestFor)}</b>に向いた一冊です。</p>
      <p>${esc(book.name)}は${esc(st.label)}に位置づけられ、難易度は 10 段階中 ${book.diff}。${esc(dp.text)}にあたります。到達目安は「${esc(book.hensachi)}」です。${esc(paceSentence(book.hours))}</p>
      <p>参考書は「良い本かどうか」より「いま自分が手を出す段になっているか」で決まります。今の自分にとって難しすぎる本を選ぶと、解説を読んでも定着せずに時間だけが過ぎます。逆にやさしすぎる本は、達成感のわりに得点が伸びません。上の難易度表示と到達目安を、手持ちの模試の結果と照らして判断してください。</p>
    </section>

    <div class="pc-grid">
      <div class="pc good">
        <h3><i><svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></i>強み</h3>
        <ul>
${book.pros.map(p => `          <li>${esc(p)}</li>`).join('\n')}
        </ul>
      </div>
      <div class="pc care">
        <h3><i><svg viewBox="0 0 24 24" fill="none"><path d="M12 8v5m0 3.5v.5" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke-width="1.9"/></svg></i>注意点</h3>
        <ul>
${book.cons.map(c => `          <li>${esc(c)}</li>`).join('\n')}
        </ul>
      </div>
    </div>

    ${book.unis && book.unis.length ? `<div class="note">
      <h3>この本が視野に入る志望校</h3>
      <p>${book.unis.map(u => esc(u)).join(' ／ ')}<br>
      あくまで「このレベルの本を使う人が多い層」の目安です。同じ大学でも学部・方式で必要な到達点は変わります。${sub.full}の<a href="/${sub.dir}/" style="color:var(--indigo);font-weight:700">ルート画面</a>で志望校名を直接入れると、出題形式に合わせた並びが出ます。</p>
    </div>` : ''}

    ${alts.length ? `<section class="block">
      <div class="eyebrow">Alternatives</div>
      <h2 class="sec">同じ役割・同じレベルの参考書</h2>
      <p class="sec-lead">${esc(book.name)}と同じ「${esc(st.label)}」の枠で、難易度が近い参考書です。相性で選んで構いません。ここから 1 冊を選び切ることが大切で、複数を並行させる必要はありません。</p>
      <div class="bcards">
${alts.map(b => bookCard(b, sub, stages)).join('\n')}
      </div>
    </section>` : ''}

    ${next.list.length ? `<section class="block">
      <div class="eyebrow">Next step</div>
      <h2 class="sec">この本のあとに進む参考書</h2>
      <p class="sec-lead">${esc(nextLead)}</p>
      <div class="bcards">
${next.list.map(b => bookCard(b, sub, stages)).join('\n')}
      </div>
    </section>` : ''}

    <section class="block">
      <div class="eyebrow">Where to buy</div>
      <h2 class="sec">購入する</h2>
      <div class="buy">
        <a class="az" href="${esc(az)}" target="_blank" rel="${relAz}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 4h5v16H6a1 1 0 0 1-1-1V4Zm9 0h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4V4Z" stroke-width="1.9" stroke-linejoin="round"/></svg>
          Amazon で見る
        </a>
        ${rk ? `<a class="rk" href="${esc(rk)}" target="_blank" rel="${relRk}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 4h5v16H6a1 1 0 0 1-1-1V4Zm9 0h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4V4Z" stroke-width="1.9" stroke-linejoin="round"/></svg>
          楽天ブックスで見る
        </a>` : ''}
      </div>
      <p class="buy__note">${aff ? `${affStores}へのリンクは広告リンクです。リンク経由で購入された場合、当サイトに紹介料が発生することがあります。紹介料の有無によって掲載順や評価を変えることはありません。` : ''}価格と在庫は変動するため、購入時は販売サイトの表示をご確認ください。改訂版が出ている場合があります。版を確認してから購入してください。</p>
    </section>

    <div class="cta">
      <h2>${esc(book.name)}は、あなたのルートの何冊目か</h2>
      <p>1 冊単位で選ぶより、志望校までの並びの中で位置を決めたほうが迷いません。${esc(sub.full)}では、志望校と現在地から ${counts[sub.dir]} 冊の中を通る道を組み立てられます。</p>
      <div class="cta__btns">
        <a class="p" href="/${sub.dir}/">${esc(sub.ja)}のルートを作る<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
        <a class="g" href="/">全科目を見る</a>
      </div>
    </div>
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
  data[s.dir] = extractSubject(ROOT, s.dir);
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
  const config = extractConfig(ROOT, sub.dir);
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
console.log(`合計 ${written} ページを生成した。`);

/** 科目ページの CONFIG（アフィリエイト ID）を読む */
function extractConfig(root, dir) {
  const src = fs.readFileSync(path.join(root, dir, 'index.html'), 'utf8');
  const pick = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*"([^"]*)"`));
    return m ? m[1] : '';
  };
  return { amazonTag: pick('amazonTag'), rakutenId: pick('rakutenId') };
}
