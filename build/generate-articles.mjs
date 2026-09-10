/**
 * 解説記事（比較・選び方・ランキング）を生成する。
 *
 *   科目つき記事 : /<科目>/guides/<slug>/
 *   科目なし記事 : /guides/<slug>/
 *   ジャンルの入口 : /guides/
 *   ジャンル別一覧 : /guides/<ジャンル>/
 *   科目別一覧     : /<科目>/guides/
 *
 * 本文は build/content/articles.mjs にブロックの配列として持つ。
 * 難易度や問題数といった数値は BOOKS から引くので、記事側には書かない。
 * 記事本文と参考書データが食い違うのを構造的に防ぐための決まりごと。
 *
 * ジャンルは build/content/article-categories.mjs が正本。記事 1 本ごとに
 * `category` を必ず持たせる（持たない記事はここで落とす）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SUBJECTS, ORIGIN, esc, clip } from './lib/extract.mjs';
import { loadSubjectData } from './lib/load-subject-data.mjs';
import { head, topBars, header, portalHeader, crumbs, footer, jsonLd, breadcrumbLd } from './lib/parts.mjs';
import { bookCards } from './lib/cards.mjs';
import { coverBox } from './lib/cover.mjs';
import { displayName } from './lib/booktitle.mjs';
import { ARTICLES } from './content/articles.mjs';
import { CATEGORIES, categoryOf } from './content/article-categories.mjs';
import { adUnit } from './lib/ads.mjs';
import { articleContentDate, saveDates } from './lib/updated.mjs';
import { COMBOS, POLICIES, comboTotal, routeTotal, tracksOf, monthsAt } from './lib/route-hours.mjs';
import { guidePath } from './lib/subject-guides.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const data = {};
const counts = {};
for (const s of SUBJECTS) {
  data[s.dir] = loadSubjectData(ROOT, s.dir);
  counts[s.dir] = data[s.dir].books.length;
}

/** 記事から参照する書籍を引く。見つからなければビルドを止める（リンク切れを出さない） */
function lookup(dir, id, ctxLabel) {
  const b = data[dir]?.books.find(x => x.id === id);
  if (!b) throw new Error(`${ctxLabel}: ${dir} に書籍 id "${id}" がない`);
  return b;
}

function bookLink(dir, id, label) {
  const b = lookup(dir, id, 'bookLink');
  return `<a href="/${dir}/books/${b.id}/">${esc(label || displayName(b, dir))}</a>`;
}

/**
 * 記事の中で 1 冊を指すときの共通表示（書影 + 書名リンク）。
 *
 * 書名だけを置くと、読んだ人は文字列を頭の中で現物に変換しないと本屋で探せない。
 * 比較表・順位表・一騎打ち・部門別で同じ形にするため、ここ 1 か所で組み立てる
 * （参考書カードを build/lib/cards.mjs に 1 本化したのと同じ理由）。
 *
 * 書影は書名の言い換えでしかないので、読み上げには書名のリンクだけを渡す
 * （aria-hidden と tabindex="-1"。build/generate-routes.mjs の書影と同じ扱い）。
 */
function bookCover(dir, book) {
  const sub = SUBJECTS.find(s => s.dir === dir);
  if (!sub) throw new Error(`bookCover: 知らない科目 ${dir}`);
  const color = (data[dir].stages[book.stage] || {}).color || sub.color;
  return `<a class="bref__cov" href="/${dir}/books/${book.id}/" tabindex="-1" aria-hidden="true">`
    + `${coverBox(book, { color })}</a>`;
}

/** 表のセルに置く 1 冊。書影を左に、書名リンクを右に並べる */
function bookRef(dir, id, label) {
  const b = lookup(dir, id, 'bookRef');
  return `<span class="bref">${bookCover(dir, b)}`
    + `<span class="bref__t">${bookLink(dir, b.id, label)}</span></span>`;
}

/**
 * この実行で書き出すページのパス。
 *
 * 記事どうしのリンクは、ARTICLES の並び順に関係なく張れなければならない。
 * `siteLink()` がディスク上のファイルだけを見ていると、**配列の後ろにある記事へ
 * 前の記事からリンクした瞬間、まっさらな状態からのビルドが落ちる**（実際に落ちた）。
 * 2 回流せば通るが、「2 回流さないと通らないビルド」は壊れている。
 * これから書くページも実在するものとして扱う。
 */
const PLANNED = new Set([
  '/guides/',
  ...ARTICLES.map(a => (a.subject ? `/${a.subject}/guides/${a.slug}/` : `/guides/${a.slug}/`)),
  ...ARTICLES.filter(a => a.subject).map(a => `/${a.subject}/guides/`),
  ...CATEGORIES.filter(c => ARTICLES.some(a => a.category === c.id)).map(c => `/guides/${c.id}/`),
]);

/**
 * サイト内リンク。`{{/methodology/|データの作り方}}` の形で書く。
 *
 * 本文は `esc()` を通すので、記事側に生の `<a>` を書いても文字列として出てしまう。
 * かといって素通しにすると本文から任意の HTML を入れられる。そこで
 * **パスと表示名だけを受け取り、リンクはここで組み立てる。**
 *
 * パスは `/…/` の形（末尾スラッシュ必須。無いと本番で 301 になる）で、
 * **実在するページか、この実行で書き出すページでなければビルドを止める。**
 * 記事から死んだリンクを出さないため。
 */
function siteLink(href, label) {
  if (!/^\/[a-z0-9/_-]*\/$/i.test(href)) {
    throw new Error(`siteLink: パスの形が不正（/…/ で書く）: ${href}`);
  }
  const file = path.join(ROOT, href, 'index.html');
  if (!PLANNED.has(href) && !fs.existsSync(file)) {
    throw new Error(`siteLink: 実在しないページ: ${href}`);
  }
  return `<a href="${href}">${esc(label)}</a>`;
}

/**
 * 本文中の記法を HTML に変換する。
 *   [[id]] / [[id|表示名]]              その記事の科目の書籍ページへのリンク
 *   [[科目:id]] / [[科目:id|表示名]]     別の科目の書籍を指す
 *   {{/path/|表示名}}                   サイト内の他のページへのリンク
 *   **強調**                            <b>
 *
 * 科目に属さない記事（/guides/…）は既定の科目を持たないので、
 * **必ず `科目:id` の形で書く。**書かないとここで落ちる（どの科目の
 * 同名 id を指したのか推測しない）。
 */
function inline(text, dir) {
  return esc(text)
    .replace(/\{\{(\/[^|{}]*)\|([^{}]+)\}\}/g, (_, href, label) => siteLink(href, label))
    .replace(/\[\[(?:([a-z]+):)?([a-z0-9_-]+)(?:\|([^\]]+))?\]\]/gi, (_, d, id, label) => {
      const target = d || dir;
      if (!target) throw new Error(`[[${id}]]: 科目に属さない記事では [[科目:${id}]] の形で書く`);
      return bookLink(target, id, label);
    })
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

/**
 * 同じ記法を「素の文」に落とす。カードの抜粋・meta description のように
 * タグを置けない場所で使う。
 *
 * `inline()` を通せない場所で `esc()` だけ掛けると、`**強調**` の `*` や
 * `[[id|表示名]]` の括弧がそのまま画面に出る。記法を足すときは
 * **`inline()` とこの関数の両方を直す**（片方だけだと一覧カードにだけ生の記法が残る）。
 */
function plain(text) {
  return String(text ?? '')
    .replace(/\{\{(\/[^|{}]*)\|([^{}]+)\}\}/g, (_, href, label) => label)
    .replace(/\[\[(?:[a-z]+:)?([a-z0-9_-]+)(?:\|([^\]]+))?\]\]/gi, (_, id, label) => label || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1');
}

/**
 * 表の外枠。比較表・順位表で同じ見た目を使う。
 * 横スクロールできることを画面幅で出し分ける仕掛けは 1 か所にまとめる
 * （表の種類ごとに書き写すと、片方だけ直し忘れる）。
 */
function tableShell(inner, caption) {
  return `      <div class="tbl-scroll">
        <div class="tbl-scroll__hint">横にスクロールできます</div>
        <div class="tbl-wrap" tabindex="0" role="region" aria-label="表（横スクロールできます）">
        <table class="cmp">
${caption ? `          <caption>${esc(caption)}</caption>\n` : ''}${inner}
        </table>
        </div>
      </div>`;
}

/** 想定学習時間（h）を「◯時間」の形にする。h を持たない本は「—」 */
const hoursCell = b => (typeof b.h === 'number' ? `${b.h.toLocaleString('en-US')}時間` : '—');

/**
 * dataRank / pubRank が数える対象を絞る。
 *   dirs         対象の科目（省略すると記事の科目 1 つ）
 *   stages       この役割だけを数える
 *   excludeStages この役割を数から外す（過去問だけ外す、など）
 *   subs         分野コード（物理・化学など）で絞る
 */
function pickBooks(cond, dir) {
  const dirs = cond.dirs || [cond.dir || dir];
  const out = [];
  for (const d of dirs) {
    const sub = SUBJECTS.find(s => s.dir === d);
    if (!sub) throw new Error(`pickBooks: 知らない科目 ${d}`);
    for (const b of data[d].books) {
      if (cond.stages && !cond.stages.includes(b.stage)) continue;
      if (cond.excludeStages && cond.excludeStages.includes(b.stage)) continue;
      if (cond.subs && !cond.subs.includes(b.sub)) continue;
      out.push({ b, dir: d, sub });
    }
  }
  return out;
}

function renderBlock(bl, dir) {
  /* 手書きの HTML をそのまま出すブロック。**サイト内の正本（guides.json）からだけ使う。**
     外部の文字列を通すと XSS の入口になる（build/generate-guides-static.mjs が唯一の利用者） */
  if (bl.html) return `      ${bl.html}`;
  if (bl.p) return `      <p>${inline(bl.p, dir)}</p>`;
  if (bl.h3) return `      <h3>${esc(bl.h3)}</h3>`;
  if (bl.ul) return `      <ul>\n${bl.ul.map(li => `        <li>${inline(li, dir)}</li>`).join('\n')}\n      </ul>`;
  if (bl.note) return `      <div class="note" style="margin:22px 0">${bl.noteTitle ? `<h3>${esc(bl.noteTitle)}</h3>` : ''}<p>${inline(bl.note, dir)}</p></div>`;

  // 書籍の比較表。数値は BOOKS から引くので記事側に転記しない
  if (bl.bookTable) {
    const books = bl.bookTable.map(id => lookup(bl.dir || dir, id, 'bookTable'));
    const d = bl.dir || dir;
    const cols = bl.columns || ['難易度', '到達目安', '問題数', '想定時間', '向いている人'];
    const cell = (b, c) => ({
      '難易度': `${b.diff} / 10`,
      '到達目安': b.hensachi || '—',
      '問題数': b.problems || '—',
      '想定時間': b.hours || '—',
      '向いている人': b.bestFor || '—',
      '出版社': b.pub || '—',
      '形式': b.style || '—',
    })[c] ?? '—';
    return `      <div class="tbl-scroll">
        <div class="tbl-scroll__hint">横にスクロールできます</div>
        <div class="tbl-wrap" tabindex="0" role="region" aria-label="表（横スクロールできます）">
        <table class="cmp">
          <thead><tr><th>参考書</th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>
${books.map(b => `            <tr><th scope="row">${bookRef(d, b.id)}</th>${cols.map(c => `<td>${esc(cell(b, c))}</td>`).join('')}</tr>`).join('\n')}
          </tbody>
        </table>
        </div>
      </div>`;
  }

  // 書籍カード
  if (bl.books) {
    const d = bl.dir || dir;
    const sub = SUBJECTS.find(s => s.dir === d);
    const list = bl.books.map(id => lookup(d, id, 'books'));
    return bookCards(list, sub, data[d].stages, 'margin:20px 0');
  }
  /* 志望レベル別の総学習時間。**記事本文に数字を書かない**ための表で、
     BOOKS の h と ROUTES から毎回計算し直す（build/lib/route-hours.mjs）。

     科目・トラックが 1 つでも欠けている志望レベルは行ごと落とす。
     部分的な合計を出すと、読んだ人はそれを全科目の合計だと受け取る。 */
  if (bl.routeHoursTotal) {
    const combo = COMBOS.find(c => c.id === bl.routeHoursTotal.combo);
    if (!combo) throw new Error(`routeHoursTotal: 知らない組み合わせ ${bl.routeHoursTotal.combo}`);
    const perDay = bl.routeHoursTotal.hoursPerDay || 3;
    const rows = [];
    for (const t of data.english.tiers) {
      const omni = comboTotal(data, combo, t.id, 'omni');
      const quick = comboTotal(data, combo, t.id, 'quick');
      if (omni.missingTracks.length || quick.missingTracks.length) continue;
      if (!omni.books || !quick.books) continue;
      if (omni.missing || quick.missing) {
        throw new Error(`routeHoursTotal: ${combo.id}/${t.id} に想定学習時間を持たない本がある`);
      }
      rows.push({ t, omni, quick });
    }
    if (!rows.length) throw new Error(`routeHoursTotal: ${combo.id} に出せる行が無い`);
    return `      <div class="tbl-scroll">
        <div class="tbl-scroll__hint">横にスクロールできます</div>
        <div class="tbl-wrap" tabindex="0" role="region" aria-label="表（横スクロールできます）">
        <table class="cmp">
          <caption>${esc(combo.label)}の組み合わせ（${esc(combo.note)}）で計算した合計。1 日あたり ${perDay} 時間で割った月数を併記しています。</caption>
          <thead><tr><th>志望レベル</th><th>王道網羅型</th><th>1日${perDay}hなら</th><th>時短・精選型</th><th>1日${perDay}hなら</th></tr></thead>
          <tbody>
${rows.map(r => `            <tr><th scope="row">${esc(r.t.name)}</th>`
      + `<td>${r.omni.books}冊 / ${r.omni.hours.toLocaleString('en-US')}時間</td>`
      + `<td>${monthsAt(r.omni.hours, perDay)}か月</td>`
      + `<td>${r.quick.books}冊 / ${r.quick.hours.toLocaleString('en-US')}時間</td>`
      + `<td>${monthsAt(r.quick.hours, perDay)}か月</td></tr>`).join('\n')}
          </tbody>
        </table>
        </div>
      </div>`;
  }

  /* 1 つの志望レベルを科目別に割った表。どの科目が重いかを見せる */
  if (bl.routeHoursBySubject) {
    const { tier, combo: comboId } = bl.routeHoursBySubject;
    const combo = COMBOS.find(c => c.id === comboId);
    if (!combo) throw new Error(`routeHoursBySubject: 知らない組み合わせ ${comboId}`);
    const tierDef = data.english.tiers.find(t => t.id === tier);
    if (!tierDef) throw new Error(`routeHoursBySubject: 知らない志望レベル ${tier}`);

    const rows = [];
    for (const part of combo.parts) {
      const sub = SUBJECTS.find(x => x.dir === part.dir);
      let books = 0, hours = 0;
      for (const track of part.tracks) {
        const t = routeTotal(data[part.dir], tier, track, 'omni');
        if (!t) throw new Error(`routeHoursBySubject: ${part.dir}/${track} の ${tier} が無い`);
        if (t.missing) throw new Error(`routeHoursBySubject: ${part.dir}/${track} に想定学習時間を持たない本がある`);
        books += t.books; hours += t.hours;
      }
      rows.push({ name: sub.ja, books, hours, href: `/${part.dir}/routes/${tier}/` });
    }
    const total = rows.reduce((a, r) => a + r.hours, 0);
    return `      <div class="tbl-scroll">
        <div class="tbl-scroll__hint">横にスクロールできます</div>
        <div class="tbl-wrap" tabindex="0" role="region" aria-label="表（横スクロールできます）">
        <table class="cmp">
          <caption>${esc(tierDef.name)}（${esc(combo.label)}・王道網羅型）を科目別に割ったもの。${esc(combo.note)}で計算しています。</caption>
          <thead><tr><th>科目</th><th>冊数</th><th>想定学習時間</th><th>全体に占める割合</th></tr></thead>
          <tbody>
${rows.map(r => `            <tr><th scope="row"><a href="${r.href}">${esc(r.name)}</a></th>`
      + `<td>${r.books}冊</td><td>${r.hours.toLocaleString('en-US')}時間</td>`
      + `<td>${Math.round(r.hours / total * 100)}%</td></tr>`).join('\n')}
          </tbody>
        </table>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------
     ここから下は「比較・ランキング記事」向けのブロック。

     どれも **数値は BOOKS から引き、記事側には順位と理由だけを書く**という
     決まりを守る形にしてある。順位を人が付けるもの（rankTable・awards）と、
     データから機械的に並ぶもの（dataRank・pubRank）を型として分けているのは、
     読者が「これは誰が決めた順位か」を取り違えないようにするため。
     ------------------------------------------------------------ */

  /* 2〜3 冊の一騎打ち。強み・注意点も BOOKS の pros / cons をそのまま出す。
     記事側に書き写すと、データを直したときに記事だけ古くなる */
  if (bl.versus) {
    const d = bl.dir || dir;
    const list = bl.versus.map(id => lookup(d, id, 'versus'));
    if (list.length < 2 || list.length > 3) throw new Error('versus: 2〜3 冊で書く');
    const panels = list.map(b => `        <div class="vs__col">
          <div class="vs__head">
            ${bookCover(d, b)}
            <div class="vs__headtxt">
              <div class="vs__pub">${esc(b.pub || '')}</div>
              <b class="vs__name">${bookLink(d, b.id)}</b>
            </div>
          </div>
          <dl class="vs__spec">
            <div><dt>難易度</dt><dd>${b.diff} / 10</dd></div>
            <div><dt>到達目安</dt><dd>${esc(b.hensachi || '—')}</dd></div>
            <div><dt>分量</dt><dd>${esc(b.problems || '—')}</dd></div>
            <div><dt>想定時間</dt><dd>${esc(b.hours || '—')}</dd></div>
          </dl>
          ${Array.isArray(b.pros) && b.pros.length ? `<ul class="vs__pros">${b.pros.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
          ${Array.isArray(b.cons) && b.cons.length ? `<ul class="vs__cons">${b.cons.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        </div>`).join('\n        <div class="vs__mark" aria-hidden="true">VS</div>\n');
    return `      <div class="vs vs--${list.length}">
${panels}
      </div>${bl.verdict ? `\n      <p class="vs__verdict">${inline(bl.verdict, d)}</p>` : ''}`;
  }

  /* 編集部が順位を付ける表。順位と選ぶ理由だけを記事に書き、
     数値は BOOKS から引く。基準は記事の地の文に必ず書いておくこと */
  if (bl.rankTable) {
    const d = bl.dir || dir;
    const cols = bl.columns || ['難易度', '想定時間'];
    const cell = (b, c) => ({
      '難易度': `${b.diff} / 10`,
      '到達目安': b.hensachi || '—',
      '分量': b.problems || '—',
      '想定時間': b.hours || '—',
      '想定学習時間': hoursCell(b),
      '出版社': b.pub || '—',
      '形式': b.style || '—',
      '刊行年': b.year ? `${b.year}年` : '—',
    })[c] ?? '—';
    const rows = bl.rankTable.map((r, i) => {
      const rd = r.dir || d;
      const b = lookup(rd, r.id, 'rankTable');
      return `            <tr><th scope="row"><span class="rk">${i + 1}</span></th>`
        + `<td class="rk__name">${bookRef(rd, b.id)}</td>`
        + cols.map(c => `<td>${esc(cell(b, c))}</td>`).join('')
        + `<td class="rk__why">${inline(r.note, rd)}</td></tr>`;
    }).join('\n');
    return tableShell(`          <thead><tr><th>${esc(bl.rankLabel || '順位')}</th><th>参考書</th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>${esc(bl.whyLabel || 'この順位にした理由')}</th></tr></thead>
          <tbody>
${rows}
          </tbody>`, bl.caption);
  }

  /* 部門別。1 部門 1 冊で、部門名・選んだ理由は記事側、
     数値と出版社は BOOKS 側。科目をまたぐので dir は部門ごとに書く */
  if (bl.awards) {
    const cards = bl.awards.map(a => {
      const ad = a.dir || dir;
      const b = lookup(ad, a.id, 'awards');
      const sub = SUBJECTS.find(s => s.dir === ad);
      return `        <div class="award" style="--ac:${sub.color}">
          <div class="award__head">
            ${bookCover(ad, b)}
            <div class="award__headtxt">
              <div class="award__title">${esc(a.title)}</div>
              <b class="award__book">${bookLink(ad, b.id)}</b>
              <div class="award__meta">${esc(sub.ja)}・${esc(b.pub || '')}／難易度 ${b.diff} / 10／${esc(b.hours || '—')}</div>
            </div>
          </div>
          <p class="award__why">${inline(a.reason, ad)}</p>
        </div>`;
    }).join('\n');
    return `      <div class="awards">\n${cards}\n      </div>`;
  }

  /* データから機械的に作る順位表。記事側は条件だけを書く。
     ここで人が並べ替えないから、データを直せば順位も一緒に動く */
  if (bl.dataRank) {
    const c = bl.dataRank;
    const by = c.by || 'h';
    const order = c.order || 'desc';
    const limit = c.limit || 10;
    const rows = pickBooks(c, dir)
      .filter(x => typeof x.b[by] === 'number')
      .sort((p, q) => (order === 'asc' ? p.b[by] - q.b[by] : q.b[by] - p.b[by])
        || String(p.b.id).localeCompare(String(q.b.id)))
      .slice(0, limit);
    if (!rows.length) throw new Error(`dataRank: 条件に合う本が無い（${JSON.stringify(c)}）`);
    const valLabel = { h: '想定学習時間', diff: '難易度', year: '刊行年' }[by] || by;
    const valOf = b => ({ h: hoursCell(b), diff: `${b.diff} / 10`, year: b.year ? `${b.year}年` : '—' })[by] ?? '—';
    const multi = (c.dirs || []).length > 1;
    return tableShell(`          <thead><tr><th>順位</th>${multi ? '<th>科目</th>' : ''}<th>参考書</th><th>出版社</th><th>${esc(valLabel)}</th></tr></thead>
          <tbody>
${rows.map((x, i) => `            <tr><th scope="row"><span class="rk">${i + 1}</span></th>`
      + (multi ? `<td>${esc(x.sub.ja)}</td>` : '')
      + `<td class="rk__name">${bookRef(x.dir, x.b.id)}</td>`
      + `<td>${esc(x.b.pub || '—')}</td><td>${esc(valOf(x.b))}</td></tr>`).join('\n')}
          </tbody>`, c.caption);
  }

  /* 出版社別の収録冊数。これもその場で数える */
  if (bl.pubRank) {
    const c = bl.pubRank;
    const picked = pickBooks(c, dir);
    const tallyMap = new Map();
    for (const { b } of picked) {
      const key = String(b.pub || '不明').replace(/[（(].*$/, '').trim() || '不明';
      tallyMap.set(key, (tallyMap.get(key) || 0) + 1);
    }
    const total = picked.length;
    const rows = [...tallyMap.entries()]
      .sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0], 'ja'))
      .slice(0, c.limit || 12);
    if (!rows.length) throw new Error('pubRank: 数える本が無い');
    return tableShell(`          <thead><tr><th>順位</th><th>出版社</th><th>収録冊数（冊）</th><th>割合</th></tr></thead>
          <tbody>
${rows.map(([name, n], i) => `            <tr><th scope="row"><span class="rk">${i + 1}</span></th>`
      + `<td class="rk__name">${esc(name)}</td><td>${n}</td>`
      + `<td>${(n / total * 100).toFixed(1)}%</td></tr>`).join('\n')}
          </tbody>`, c.caption);
  }

  /* 分布。難易度 1〜10 か、刊行年を 10 年ごとに区切って数える。
     棒はあくまで飾りで、読み上げには数字と割合が渡るようにしておく */
  if (bl.hist) {
    const c = bl.hist;
    const by = c.by || 'diff';
    const picked = pickBooks(c, dir);
    const keyOf = b => (by === 'diff'
      ? (typeof b.diff === 'number' ? String(b.diff) : null)
      : (typeof b.year === 'number' ? String(Math.floor(b.year / 10) * 10) : null));
    const counted = new Map();
    let total = 0;
    for (const { b } of picked) {
      const k = keyOf(b);
      if (k === null) continue;
      counted.set(k, (counted.get(k) || 0) + 1);
      total++;
    }
    if (!total) throw new Error(`hist: 数える本が無い（${JSON.stringify(c)}）`);
    const keys = by === 'diff'
      ? Array.from({ length: 10 }, (_, i) => String(i + 1))
      : [...counted.keys()].sort((p, q) => Number(p) - Number(q));
    const max = Math.max(...keys.map(k => counted.get(k) || 0));
    const rowLabel = k => (by === 'diff' ? `難易度 ${k}` : `${k}年代`);
    return tableShell(`          <thead><tr><th>${by === 'diff' ? '難易度' : '刊行年'}</th><th>冊数（冊）</th><th>割合</th><th>分布</th></tr></thead>
          <tbody>
${keys.map(k => {
      const n = counted.get(k) || 0;
      /* 単位は列見出しに置き、セルには数字だけを出す。
         「◯◯◯冊」と書くと build/apply-count.mjs の sweep() が
         「実データに無い冊数」として拾ってしまう。分布の度数は
         収録冊数そのものではないので、あちらに登録する筋のものでもない */
      return `            <tr><th scope="row">${esc(rowLabel(k))}</th><td>${n}</td>`
        + `<td>${(n / total * 100).toFixed(1)}%</td>`
        + `<td><span class="hbar" style="--w:${max ? Math.round(n / max * 100) : 0}%" aria-hidden="true"></span></td></tr>`;
    }).join('\n')}
          </tbody>`, c.caption || `${SUBJECTS.filter(s => (c.dirs || [c.dir || dir]).includes(s.dir)).map(s => s.ja).join('・')}の収録 ${total.toLocaleString('en-US')} 冊を数えたもの。`);
  }

  /* 役割ごとの冊数と想定学習時間。1 科目のなかで「どこに本が多いか」を見せる。
     時間は中央値を出す。平均だと 250 時間級の 1 冊が帯ごと引き上げてしまう */
  if (bl.stageTally) {
    const c = bl.stageTally;
    const d = c.dir || dir;
    const stages = data[d].stages;
    const rows = [];
    for (const [key, st] of Object.entries(stages)) {
      if (c.excludeStages && c.excludeStages.includes(key)) continue;
      const books = data[d].books.filter(b => b.stage === key && (!c.subs || c.subs.includes(b.sub)));
      if (!books.length) continue;
      const hs = books.map(b => b.h).filter(h => typeof h === 'number').sort((p, q) => p - q);
      const med = hs.length ? (hs.length % 2 ? hs[(hs.length - 1) / 2] : Math.round((hs[hs.length / 2 - 1] + hs[hs.length / 2]) / 2)) : null;
      const diffs = books.map(b => b.diff).filter(v => typeof v === 'number');
      rows.push({
        name: st.label || st.short || key,
        n: books.length,
        med,
        range: diffs.length ? `${Math.min(...diffs)} 〜 ${Math.max(...diffs)}` : '—',
      });
    }
    if (!rows.length) throw new Error(`stageTally: 数える本が無い（${d}）`);
    return tableShell(`          <thead><tr><th>役割</th><th>収録冊数（冊）</th><th>想定学習時間の中央値</th><th>難易度の幅</th></tr></thead>
          <tbody>
${rows.map(r => `            <tr><th scope="row">${esc(r.name)}</th><td>${r.n}</td>`
      + `<td>${r.med === null ? '—' : `${r.med}時間`}</td><td>${esc(r.range)}</td></tr>`).join('\n')}
          </tbody>`, c.caption);
  }

  throw new Error(`未知のブロック: ${JSON.stringify(bl).slice(0, 100)}`);
}

/**
 * 記事 1 本のページ。学習ガイドの静的ページ（build/generate-guides-static.mjs）も同じ型で出すため
 * articlePage として公開する。
 */
export function articlePage(a) {
  return render(a);
}

function render(a) {
  /* 手で日付を書かず、中身が変わった日を使う。**記事 1 本ごとに求める。**
     articles.mjs には 53 本が同居しているので、ファイル単位で求めると
     1 本直すだけで全記事の更新日が動く（build/lib/updated.mjs の冒頭を参照） */
  // a.updated は記事以外の正本から作るページ（学習ガイド）が自分で求めた更新日
  const updated = a.updated || articleContentDate(a);
  const sub = a.subject ? SUBJECTS.find(s => s.dir === a.subject) : null;
  const cat = categoryOf(a.category);
  const base = sub ? `/${sub.dir}/guides/${a.slug}/` : `/guides/${a.slug}/`;
  const url = `${ORIGIN}${base}`;
  const color = sub ? sub.color : '#24427C';

  const crumbItems = [{ name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` }];
  if (sub) crumbItems.push({ name: sub.full, url: `/${sub.dir}/`, absUrl: `${ORIGIN}/${sub.dir}/` });
  crumbItems.push({ name: '解説記事', url: sub ? `/${sub.dir}/guides/` : '/guides/', absUrl: `${ORIGIN}${sub ? `/${sub.dir}` : ''}/guides/` });
  crumbItems.push({ name: a.h1 || a.title, url: base, absUrl: url });

  const toc = a.sections.map((s, i) => `        <li><a href="#s${i + 1}">${esc(s.h2)}</a></li>`).join('\n');

  const body = a.sections.map((s, i) => `    <section class="block prose" id="s${i + 1}">
      <h2 class="sec">${esc(s.h2)}</h2>
${s.body.map(bl => renderBlock(bl, a.subject)).join('\n')}
    </section>`).join('\n\n');

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: a.h1 || a.title,
        description: a.desc,
        inLanguage: 'ja',
        datePublished: a.published,
        dateModified: updated,
        author: { '@type': 'Organization', name: 'ルート大全 編集部', url: `${ORIGIN}/` },
        publisher: { '@type': 'Organization', name: 'ルート大全 編集部', url: `${ORIGIN}/` },
        mainEntityOfPage: url,
        ...(sub ? { about: { '@type': 'Thing', name: `大学受験 ${sub.ja}の参考書選び` } } : {}),
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url, name: a.title, description: a.desc, inLanguage: 'ja',
        isPartOf: { '@id': `${ORIGIN}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title: a.title, desc: clip(a.desc, 120), url, ogImage: `${ORIGIN}/assets/ogp${sub ? `-${sub.dir}` : ''}.png` })}
<style>
:root{--sc:${color}}
.art-head{padding:26px 0 0}
.art-h1{font-family:var(--serif);font-weight:800;font-size:28px;line-height:1.4;letter-spacing:.02em;margin-top:12px}
@media(min-width:760px){.art-h1{font-size:36px}}
.art-meta{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-top:16px;font-family:var(--mono);font-size:11px;color:var(--muted-2);letter-spacing:.06em}
.art-lead{font-size:15px;color:var(--ink-2);line-height:2;margin-top:20px;max-width:68ch}
.toc{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--sc);padding:19px 22px;margin-top:26px;box-shadow:var(--sh-s)}
.toc h2{font-family:var(--serif);font-weight:800;font-size:14px;letter-spacing:.05em;margin-bottom:11px}
.toc ol{list-style:none;counter-reset:t;display:flex;flex-direction:column;gap:2px}
.toc li{counter-increment:t;font-size:13px;line-height:1.6;display:flex;gap:10px;align-items:center}
.toc li::before{content:counter(t,decimal-leading-zero);font-family:var(--mono);font-size:10.5px;color:var(--muted-2);font-weight:600}
/* タップ領域を 24px 以上にする（WCAG のターゲットサイズ）。
   gap を詰めたぶんを min-height で取り、行の見た目は変えない。 */
.toc a{color:var(--ink-2);font-weight:700;transition:.15s;display:inline-flex;align-items:center;min-height:26px}
.toc a:hover{color:var(--accent-deep)}
/* 表は幅を超えたら中だけ横スクロールさせる。画面が狭いと「切れている」と
   誤解されやすいので、スクロールできることを画面幅で出し分けて明示する。 */
.tbl-scroll{margin:22px 0}
.tbl-scroll__hint{display:none;font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:var(--muted-2);margin-bottom:7px;align-items:center;gap:7px}
.tbl-scroll__hint::before{content:"";width:14px;height:1.5px;background:var(--line-d)}
@media(max-width:860px){.tbl-scroll__hint{display:flex}}
.tbl-wrap{overflow-x:auto;border:1px solid var(--line);box-shadow:var(--sh-s);background:var(--surface);-webkit-overflow-scrolling:touch}
table.cmp{border-collapse:collapse;width:100%;min-width:640px;font-size:12.5px}
table.cmp th,table.cmp td{padding:11px 13px;text-align:left;border-bottom:1px solid var(--line-2);vertical-align:top;line-height:1.65}
table.cmp thead th{background:var(--surface-2);font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.04em;white-space:nowrap;border-bottom:1px solid var(--line)}
table.cmp tbody th{font-weight:700;color:var(--ink);white-space:nowrap}
table.cmp tbody th a{color:var(--indigo);text-decoration:underline;text-underline-offset:2px}
table.cmp tbody tr:last-child th,table.cmp tbody tr:last-child td{border-bottom:none}
table.cmp td{color:var(--ink-2)}
.art-cat{margin-top:12px;font-size:12px}
.art-cat a{color:var(--indigo);font-weight:700;text-decoration:underline;text-underline-offset:3px}
/* 順位表。順位の数字はモノスペースで、桁がそろって見えるようにする */
.rk{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:22px;background:var(--sc);color:#fff;font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.02em}
table.cmp td.rk__name{font-weight:700;color:var(--ink);white-space:nowrap}
table.cmp td.rk__name a{color:var(--indigo);text-decoration:underline;text-underline-offset:2px}
table.cmp td.rk__why{min-width:230px;color:var(--ink-2)}
/* 記事の中で 1 冊を指す共通表示（書影 + 書名）。書名だけでは、読んだ人が
   書店や通販で現物と結び付けられない。書影は書名の言い換えなので、
   リンクの下線や色は書名の側にだけ出す（.bref__cov には渡さない） */
.bref{display:flex;align-items:flex-start;gap:10px;min-width:0}
.bref .bref__cov{flex:none;display:block;padding:0;text-decoration:none}
.bref .rt-cov{--cw:34px}
.bref__t{min-width:0;padding-top:1px}
/* 一騎打ち。狭い画面では縦に積み、VS の印は区切りとして残す */
.vs{display:grid;grid-template-columns:1fr;gap:0;margin:24px 0;border:1px solid var(--line);background:var(--surface);box-shadow:var(--sh-s)}
.vs__col{padding:18px 19px;border-top:3px solid var(--sc)}
.vs__mark{display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.16em;color:var(--muted-2);background:var(--surface-2);padding:7px 0;border-top:1px solid var(--line-2);border-bottom:1px solid var(--line-2)}
@media(min-width:760px){
  .vs--2{grid-template-columns:1fr auto 1fr}
  .vs--3{grid-template-columns:1fr auto 1fr auto 1fr}
  .vs__mark{padding:0 10px;border:none;border-left:1px solid var(--line-2);border-right:1px solid var(--line-2)}
}
.vs__head{display:flex;align-items:flex-start;gap:13px}
.vs__head .bref__cov{flex:none;display:block;padding:0;text-decoration:none}
.vs__head .rt-cov{--cw:56px}
.vs__headtxt{min-width:0;flex:1}
.vs__pub{font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:var(--muted-2)}
.vs__name{display:block;font-family:var(--serif);font-size:16px;line-height:1.45;margin-top:6px}
.vs__name a{color:var(--indigo);text-decoration:underline;text-underline-offset:3px}
.vs__spec{margin-top:13px;display:flex;flex-direction:column;gap:5px}
.vs__spec div{display:flex;gap:10px;font-size:12.5px;line-height:1.6}
.vs__spec dt{flex:0 0 5.5em;color:var(--muted);font-size:11.5px;padding-top:1px}
.vs__spec dd{color:var(--ink-2);flex:1}
.vs__pros,.vs__cons{margin-top:12px;display:flex;flex-direction:column;gap:4px;list-style:none}
.vs__pros li,.vs__cons li{font-size:12.5px;line-height:1.7;color:var(--ink-2);padding-left:17px;position:relative}
/* 行頭の +/- は .prose li::before（5px の丸）と同じ疑似要素を使う。丸の指定が
   残ると、+ の左上に点が重なって出る。ここで丸の分を打ち消しておく */
.vs__pros li::before,.vs__cons li::before{top:0;width:auto;height:auto;background:none;border-radius:0}
.vs__pros li::before{content:"+";position:absolute;left:0;color:var(--sc);font-weight:700}
.vs__cons li::before{content:"-";position:absolute;left:2px;color:var(--muted-2);font-weight:700}
.vs__verdict{margin-top:14px;padding-left:13px;border-left:3px solid var(--sc);font-size:14px;line-height:1.95;color:var(--ink-2)}
/* 部門別。1 部門 1 枚のカードで、色は科目のテーマカラー */
.awards{display:grid;grid-template-columns:1fr;gap:11px;margin:24px 0}
@media(min-width:700px){.awards{grid-template-columns:repeat(2,1fr)}}
.award{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--ac);padding:16px 18px;box-shadow:var(--sh-s)}
.award__head{display:flex;align-items:flex-start;gap:13px}
.award__head .bref__cov{flex:none;display:block;padding:0;text-decoration:none}
.award__head .rt-cov{--cw:48px}
.award__headtxt{min-width:0;flex:1}
.award__title{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;color:var(--ac);font-weight:700}
.award__book{display:block;font-family:var(--serif);font-size:15.5px;line-height:1.45;margin-top:8px}
.award__book a{color:var(--indigo);text-decoration:underline;text-underline-offset:3px}
.award__meta{font-size:11.5px;color:var(--muted-2);margin-top:7px;line-height:1.7}
.award__why{font-size:12.5px;color:var(--ink-2);margin-top:9px;line-height:1.85}
/* 分布の棒。数字と割合は同じ行に文字で出しているので、棒は装飾に徹する */
.hbar{display:block;height:9px;min-width:1px;width:var(--w);background:var(--sc);opacity:.55}${a.sections.some(sec => sec.body.some(bl => bl.html && bl.html.includes('g-quote'))) ? `
/* 学習ガイド（guides.json の本文）の引用。科目トップの .g-quote と同じ役割。
   使うページにだけ出す（全記事に足すと、記事ページの sitemap の更新日まで動く） */
.g-quote{margin:22px 0;padding:14px 18px;border-left:3px solid var(--sc);background:var(--surface);font-family:var(--serif);font-weight:700;font-size:15px;line-height:1.9;color:var(--ink)}` : ''}
</style>
</head>
<body>

${topBars(a.subject || '')}

${sub ? header(sub) : portalHeader()}

<main class="wrap wrap--read">
  ${crumbs(crumbItems)}

  <article>
    <div class="art-head">
      <div class="eyebrow">${esc(cat.en)}</div>
      <h1 class="art-h1">${esc(a.h1 || a.title)}</h1>
      <p class="art-cat"><a href="/guides/${cat.id}/">${esc(cat.label)}</a> の記事</p>
      <div class="art-meta">
        <span>公開 ${esc(a.published)}</span>
        ${updated !== a.published ? `<span>更新 <time datetime="${updated}">${updated}</time></span>` : ''}
        <span>ルート大全 編集部</span>
      </div>
      <p class="art-lead">${inline(a.lead, a.subject)}</p>
    </div>

    <nav class="toc" aria-label="目次">
      <h2>この記事の内容</h2>
      <ol>
${toc}
      </ol>
    </nav>${adUnit('inArticle')}

${body}

    <div class="cta">
      <h2>${esc(a.ctaTitle || '自分のルートに落とし込む')}</h2>
      <p>${esc(a.ctaText || '記事で挙げた本が、自分の志望校までの並びの中でどこに入るかは、ルート画面で確認できます。志望校と今の学力を選ぶだけです。')}</p>
      <div class="cta__btns">
        <a class="p" href="${sub ? `/${sub.dir}/` : '/#subjects'}">${esc(sub ? `${sub.ja}のルートを作る` : '科目を選んで始める')}<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
        <a class="g" href="${sub ? `/${sub.dir}/books/` : '/#catalog'}">参考書一覧を見る</a>
      </div>
    </div>${adUnit('bottom')}
  </article>
</main>

${footer(a.subject || '', counts)}

${jsonLd(ld)}

</body>
</html>
`;
}

/* ============================================================
   一覧ページ

   記事が 50 本を超えると、1 枚の一覧では読み分けができない。そこで
   3 種類に分ける。

     /guides/            ジャンルの入口。どのジャンルに何本あるかだけを見せる
     /guides/<ジャンル>/  そのジャンルの記事を科目をまたいで集める
     /<科目>/guides/      その科目の記事をジャンルで区切って並べる

   カードの見た目（.gcard）は 3 枚で共通なので、CSS も HTML の外枠も
   1 か所にまとめてある。ジャンルごとに書き写さない。
   ============================================================ */

/** 一覧カード 1 枚。科目をまたぐ一覧では科目名も出す */
function guideCard(a, { showSubject = false } = {}) {
  const sub = a.subject ? SUBJECTS.find(s => s.dir === a.subject) : null;
  const href = `${sub ? `/${sub.dir}` : ''}/guides/${a.slug}/`;
  const cat = categoryOf(a.category);
  // リード文は記法を落として素の文にする（表示名が無い [[…]] は id を出さず落とす）
  const lead = clip(plain(a.lead), 96);
  return `      <a class="gcard" href="${href}"${sub ? ` style="--gs:${sub.color}"` : ''}>
        <div class="gcard__no">${esc(cat.en)}${showSubject ? `<span class="gcard__sub">${esc(sub ? sub.ja : '全科目')}</span>` : ''}</div>
        <b>${esc(a.h1 || a.title)}</b>
        <p>${esc(lead)}</p>
        <span class="gcard__foot">${esc(a.published)}</span>
      </a>`;
}

/** 一覧ページ 3 種で使い回す CSS。--sc は呼び出し側が :root で決める */
const LIST_CSS = `.ggrid{display:grid;grid-template-columns:1fr;gap:11px;margin-top:22px}
@media(min-width:700px){.ggrid{grid-template-columns:repeat(2,1fr)}}
.gcard{background:var(--surface);border:1px solid var(--line);border-top:3px solid var(--gs,var(--sc));padding:18px 19px 16px;box-shadow:var(--sh-s);transition:.16s;display:flex;flex-direction:column}
.gcard:hover{transform:translateY(-3px);box-shadow:var(--sh-m);border-color:var(--line-d);border-top-color:var(--gs,var(--sc))}
.gcard__no{font-family:var(--mono);font-size:10px;color:var(--accent);letter-spacing:.14em;text-transform:uppercase;margin-bottom:9px;display:flex;gap:9px;align-items:center}
.gcard__sub{color:var(--muted-2);letter-spacing:.06em;text-transform:none;padding-left:9px;border-left:1px solid var(--line-d)}
.gcard b{font-family:var(--serif);font-weight:800;font-size:16.5px;letter-spacing:.02em;line-height:1.45;color:var(--ink)}
.gcard p{font-size:12.5px;color:var(--muted);margin-top:9px;line-height:1.8;flex:1}
.gcard__foot{font-family:var(--mono);font-size:10px;color:var(--muted-2);margin-top:13px;padding-top:10px;border-top:1px dashed var(--line);letter-spacing:.06em}
/* ジャンルの入口カード。記事カードと見分けが付くよう、左に色の帯を置く */
.cgrid{display:grid;grid-template-columns:1fr;gap:11px;margin-top:22px}
@media(min-width:640px){.cgrid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1000px){.cgrid{grid-template-columns:repeat(3,1fr)}}
.ccard{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--sc);padding:19px 20px 17px;box-shadow:var(--sh-s);transition:.16s;display:flex;flex-direction:column}
.ccard:hover{transform:translateY(-3px);box-shadow:var(--sh-m);border-color:var(--line-d);border-left-color:var(--sc)}
.ccard__en{font-family:var(--mono);font-size:10px;color:var(--accent);letter-spacing:.14em;text-transform:uppercase}
.ccard b{font-family:var(--serif);font-weight:800;font-size:19px;letter-spacing:.02em;line-height:1.4;color:var(--ink);margin-top:8px}
.ccard p{font-size:12.5px;color:var(--muted);margin-top:9px;line-height:1.85;flex:1}
.ccard__n{font-family:var(--mono);font-size:10.5px;color:var(--muted-2);margin-top:13px;padding-top:10px;border-top:1px dashed var(--line);letter-spacing:.06em}
/* ジャンルの横並びナビ。科目別一覧とジャンル一覧の両方に置く */
.gnav{display:flex;flex-wrap:wrap;gap:7px;margin-top:18px}
.gnav a{display:inline-flex;align-items:center;min-height:30px;padding:0 12px;background:var(--surface);border:1px solid var(--line);font-size:12px;font-weight:700;color:var(--ink-2);transition:.14s}
.gnav a:hover{border-color:var(--sc);color:var(--sc)}
.gnav a[aria-current="page"]{background:var(--sc);border-color:var(--sc);color:#fff}
.gsec{margin-top:34px}
.gsec__h{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;padding-bottom:9px;border-bottom:1px solid var(--line)}
.gsec__h h2{font-family:var(--serif);font-weight:800;font-size:19px;letter-spacing:.02em}
.gsec__h span{font-family:var(--mono);font-size:10.5px;color:var(--muted-2);letter-spacing:.06em}
.gsec__lead{font-size:12.5px;color:var(--muted);line-height:1.9;margin-top:11px}`;

/** 一覧ページの外枠。title / desc / 本文だけを差し替える */
function listPage({ dir, url, title, desc, crumbItems, ldName, body, color }) {
  const sub = dir ? SUBJECTS.find(s => s.dir === dir) : null;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'CollectionPage', '@id': `${url}#webpage`,
        url, name: ldName || title, description: desc, inLanguage: 'ja',
        isPartOf: { '@id': `${ORIGIN}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
    ],
  };
  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc: clip(desc, 120), url, ogImage: `${ORIGIN}/assets/ogp${sub ? `-${sub.dir}` : ''}.png` })}
<style>
:root{--sc:${color}}
${LIST_CSS}
</style>
</head>
<body>

${topBars(dir || '')}

${sub ? header(sub) : portalHeader()}

<main class="wrap wrap--read">
  ${crumbs(crumbItems)}

${body}${adUnit('bottom', '  ')}
</main>

${footer(dir || '', counts)}

${jsonLd(ld)}

</body>
</html>
`;
}

/** ジャンルの横並びナビ。current を渡すとそのジャンルに印を付ける */
function genreNav(counts_, current) {
  const items = CATEGORIES.filter(c => counts_.get(c.id))
    .map(c => `      <a href="/guides/${c.id}/"${c.id === current ? ' aria-current="page"' : ''}>${esc(c.label)}（${counts_.get(c.id)}）</a>`)
    .join('\n');
  return `    <nav class="gnav" aria-label="ジャンル">\n${items}\n    </nav>`;
}

/** 記事をジャンルごとに数える */
function countByCategory(list) {
  const m = new Map();
  for (const a of list) m.set(a.category, (m.get(a.category) || 0) + 1);
  return m;
}

/** /guides/ — ジャンルの入口 */
function renderHub(all) {
  const url = `${ORIGIN}/guides/`;
  const perCat = countByCategory(all);
  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: '解説記事', url: '/guides/', absUrl: url },
  ];

  const cards = CATEGORIES.filter(c => perCat.get(c.id)).map(c => `      <a class="ccard" href="/guides/${c.id}/">
        <div class="ccard__en">${esc(c.en)}</div>
        <b>${esc(c.label)}</b>
        <p>${esc(c.blurb)}</p>
        <span class="ccard__n">記事 ${perCat.get(c.id)} 本</span>
      </a>`).join('\n');

  const subjectLinks = SUBJECTS
    .filter(s => all.some(a => a.subject === s.dir))
    .map(s => `      <a href="/${s.dir}/guides/">${esc(s.ja)}（${all.filter(a => a.subject === s.dir).length}）</a>`)
    .join('\n');

  const body = `  <div class="block" style="margin-top:26px">
    <div class="eyebrow">Guides</div>
    <h1 class="sec" style="font-size:29px">参考書の読みもの</h1>
    <p class="sec-lead">よく比べられる参考書の違い、目的別のランキング、収録データを数え直して分かったこと。全 ${all.length} 本をジャンルで分けています。数値はすべて{{METHOD}}に沿って付けたもので、記事ごとに書き写してはいません。</p>
    <div class="cgrid">
${cards}
    </div>
  </div>

  <div class="block gsec">
    <div class="gsec__h"><h2>科目から探す</h2><span>SUBJECT</span></div>
    <p class="gsec__lead">1 科目のなかでの積み方を読みたいときは、科目別の一覧から入るほうが早く着きます。</p>
    <nav class="gnav" aria-label="科目">
${subjectLinks}
    </nav>
  </div>`.replace('{{METHOD}}', siteLink('/methodology/', 'データの作り方'));

  return listPage({
    dir: '', url,
    title: '参考書の読みもの｜比較・ランキング・データ - ルート大全',
    desc: `大学受験の参考書について、比較・ランキング・データ分析・選び方をまとめた記事 ${all.length} 本。ジャンル別に分けて並べています。`,
    crumbItems, body, color: '#24427C',
  });
}

/** /guides/<ジャンル>/ — 科目をまたいで 1 ジャンルを集める */
function renderGenre(cat, list, allCounts) {
  const url = `${ORIGIN}/guides/${cat.id}/`;
  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: '解説記事', url: '/guides/', absUrl: `${ORIGIN}/guides/` },
    { name: cat.label, url: `/guides/${cat.id}/`, absUrl: url },
  ];
  const body = `  <div class="block" style="margin-top:26px">
    <div class="eyebrow">${esc(cat.en)}</div>
    <h1 class="sec" style="font-size:29px">${esc(cat.label)}</h1>
    <p class="sec-lead">${esc(cat.lead)}</p>
${genreNav(allCounts, cat.id)}
    <div class="ggrid">
${list.map(a => guideCard(a, { showSubject: true })).join('\n')}
    </div>
  </div>`;
  return listPage({
    dir: '', url,
    title: `${cat.label}の記事一覧（${list.length}本） - ルート大全`,
    desc: `大学受験の参考書についての「${cat.label}」記事 ${list.length} 本。${cat.blurb}。`,
    crumbItems, body, color: '#24427C',
  });
}

/** /<科目>/guides/ — 1 科目の記事をジャンルで区切って並べる */
function renderSubjectIndex(dir, list, allCounts) {
  const sub = SUBJECTS.find(s => s.dir === dir);
  const url = `${ORIGIN}/${dir}/guides/`;
  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: sub.full, url: `/${dir}/`, absUrl: `${ORIGIN}/${dir}/` },
    { name: '解説記事', url: `/${dir}/guides/`, absUrl: url },
  ];

  const sections = CATEGORIES
    .map(c => ({ c, items: list.filter(a => a.category === c.id) }))
    .filter(x => x.items.length)
    .map(({ c, items }) => `  <div class="block gsec" id="${c.id}">
    <div class="gsec__h"><h2>${esc(c.label)}</h2><span>${esc(c.en)} — ${items.length}本</span></div>
    <p class="gsec__lead">${esc(c.lead)}</p>
    <div class="ggrid">
${items.map(a => guideCard(a)).join('\n')}
    </div>
  </div>`).join('\n\n');

  /* 科目トップの学習ガイドを 1 本 1 ページにしたもの（build/generate-guides-static.mjs） */
  const guides = (data[dir] && data[dir].guides) || [];
  const guideSec = guides.length ? `  <div class="block gsec" id="study-basics">
    <div class="gsec__h"><h2>学習の進め方</h2><span>Study — ${guides.length}本</span></div>
    <p class="gsec__lead">${esc(sub.full)}のトップで読める学習ガイドを、1 本ずつ 1 ページにまとめたものです。参考書を選ぶ前に、進め方の土台を決めておくための話です。</p>
    <div class="ggrid">
${guides.map((g, i) => `      <a class="gcard" href="${guidePath(dir, i)}">
        <div class="gcard__no">Study ${String(i + 1).padStart(2, '0')}</div>
        <b>${esc(g.t)}</b>
        <p>${esc(g.s)}</p>
      </a>`).join('\n')}
    </div>
  </div>

` : '';

  const jump = [
    ...(guides.length ? ['      <a href="#study-basics">学習の進め方</a>'] : []),
    ...CATEGORIES
      .filter(c => list.some(a => a.category === c.id))
      .map(c => `      <a href="#${c.id}">${esc(c.label)}</a>`),
  ].join('\n');

  const body = `  <div class="block" style="margin-top:26px">
    <div class="eyebrow">Guides</div>
    <h1 class="sec" style="font-size:29px">${esc(sub.ja)}の参考書の読みもの</h1>
    <p class="sec-lead">${esc(sub.ja)}でよく比較される参考書の違い、目的別のランキング、積む順番をまとめた記事 ${list.length} 本です。難易度や問題数は${esc(sub.full)}に収録しているデータをそのまま参照しています。</p>
    <nav class="gnav" aria-label="ジャンル">
${jump}
    </nav>
  </div>

${guideSec}${sections}

  <div class="block gsec">
    <div class="gsec__h"><h2>ほかの科目・ジャンルから探す</h2><span>MORE</span></div>
    <p class="gsec__lead">科目をまたいだ比較やランキングは、ジャンル別の一覧にまとめてあります。</p>
${genreNav(allCounts)}
  </div>`;

  return listPage({
    dir, url,
    title: `${sub.ja}の参考書の比較・ランキング記事一覧 - ${sub.full}`,
    desc: `大学受験${sub.ja}の参考書について、似た本の違い・目的別ランキング・積む順番を解説した記事の一覧（${list.length} 本）。`,
    crumbItems, body, color: sub.color,
  });
}

/* ============================================================
   実行

   import されたときは走らせない（articlePage を学習ガイドの静的ページが使うため）
   ============================================================ */

function main() {
/* ジャンル id は /guides/<ジャンル>/ という URL になる。科目に属さない記事は
   /guides/<slug>/ に出るので、両者がぶつかると同じパスに 2 枚書き出すことになる。
   静かに片方が消えるより、ここで止めるほうがよい */
for (const c of CATEGORIES) {
  const hit = ARTICLES.find(a => a.slug === c.id);
  if (hit) throw new Error(`ジャンル id "${c.id}" と記事の slug がぶつかっている（${hit.title}）`);
}

/* 記事 1 本ごとの前提を先にまとめて見る。1 本ずつ render() の中で落とすと、
   何本直せばよいのかが分からないまま止まる */
{
  const bad = [];
  const seenSlug = new Set();
  for (const a of ARTICLES) {
    if (!a.category) bad.push(`${a.slug}: category が無い`);
    else try { categoryOf(a.category); } catch (e) { bad.push(`${a.slug}: ${e.message}`); }
    const key = `${a.subject || ''}/${a.slug}`;
    if (seenSlug.has(key)) bad.push(`${key}: slug が重複している`);
    seenSlug.add(key);
    if (a.subject && !SUBJECTS.some(s => s.dir === a.subject)) bad.push(`${a.slug}: 知らない科目 ${a.subject}`);
  }
  if (bad.length) throw new Error(`記事の定義が不正:\n  - ${bad.join('\n  - ')}`);
}

const bySubject = new Map();
for (const a of ARTICLES) {
  const key = a.subject || '';
  if (!bySubject.has(key)) bySubject.set(key, []);
  bySubject.get(key).push(a);
}
const byCategory = new Map();
for (const a of ARTICLES) {
  if (!byCategory.has(a.category)) byCategory.set(a.category, []);
  byCategory.get(a.category).push(a);
}
const catCounts = countByCategory(ARTICLES);

const write = (dir, html) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
};

let n = 0;
for (const a of ARTICLES) {
  write(a.subject
    ? path.join(ROOT, a.subject, 'guides', a.slug)
    : path.join(ROOT, 'guides', a.slug), render(a));
  n++;
}

// 科目別の一覧
for (const [key, list] of bySubject) {
  if (!key) continue;   // 科目に属さない記事はジャンル別の一覧から辿る
  write(path.join(ROOT, key, 'guides'), renderSubjectIndex(key, list, catCounts));
  n++;
  console.log(`  ✓ ${key}: 記事 ${list.length} 本 + 一覧`);
}

// ジャンル別の一覧
for (const c of CATEGORIES) {
  const list = byCategory.get(c.id);
  if (!list || !list.length) continue;
  write(path.join(ROOT, 'guides', c.id), renderGenre(c, list, catCounts));
  n++;
  console.log(`  ✓ ${c.label}: 記事 ${list.length} 本`);
}

// ジャンルの入口
write(path.join(ROOT, 'guides'), renderHub(ARTICLES));
n++;
console.log(`  ✓ /guides/（ジャンル ${catCounts.size} 種の入口）`);

console.log(`合計 ${n} ページを生成した（記事 ${ARTICLES.length} 本）。`);

/* 更新日の台帳を書き戻す。書き戻さないと次の実行で前回の日付を思い出せず、
   実際には変えていない日を「更新日」として出してしまう */
saveDates();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
