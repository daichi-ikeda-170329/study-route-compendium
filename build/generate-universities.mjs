/**
 * 大学別ページ（/univ/<slug>/）と、その一覧（/univ/）を生成する。
 *
 * ## なぜこのページを作るか
 *
 * 受験生が検索するのは「早稲田 英語 参考書」であって「早慶上智 英語 参考書ルート」
 * ではない。ところが 2026-09-08 まで、このサイトの URL は志望レベル
 * （sokei / march / nikkoma …）単位でしか立っておらず、**大学名を持つページが
 * 1 枚も無かった**。Search Console の上位クエリ 11 件もすべて「〈参考書名〉 レベル」型で、
 * 大学名のクエリは 1 件も入っていない。
 *
 * 一方で `data/subjects/<科目>/universities.json` には、160 校ぶんの
 * 出題形式（`no`）・科目別の目標偏差値（`h`）が 5 科目それぞれに手書きで入っている。
 * ページの材料はもう揃っていて、URL に出していないだけだった。
 *
 * ## 「同じ志望レベルの大学は中身が同じ」にならないか
 *
 * ならない。志望レベルが同じでも `no` は大学ごとに書き分けてある。
 * 例（すべて tier=sokei）:
 *   早稲田 … 学部ごとに現代文＋古文＋漢文の構成が違う
 *   慶應   … 一般選抜に国語の科目試験が無く、小論文を課す
 *   上智   … 2021 年度以降、独自の日本史・世界史を廃止し共通テストで評価する
 *
 * 5 科目を 1 ページにまとめると、**固有テキストは 160 校すべてで 400 字以上**
 * （中央値 499 字・最少 407 字。`universities.json` から実測）になる。
 * 加えて科目別の目標偏差値表は 1 校ずつ値が違う。
 *
 * **薄いページを増やさないための線引き（守ること）**
 *   - 5 科目すべてのデータが揃っている大学だけを出す。理科だけの 21 校
 *     （九州工業大学など。固有テキストが 140 字前後）は**ページにしない**
 *   - 参考書は志望レベルのルートから**その大学の出題に噛み合うものだけ**を選ぶ
 *     （`build/lib/uni-picks.mjs`）。ルートの先頭から順に取ると、同じ志望レベルの
 *     大学が全部同じ並びになってしまう
 *
 * ## 出題の説明は、データにある分をすべて出す（2026-09-08 の改訂）
 *
 * 初版は `no`（出題形式）と `h`（目標偏差値）しか出していなかった。だが
 * `universities.json` には、読者が先に知りたい事実がほかにも入っている。
 *
 *   国語   `time` 学部別の試験時間と現古漢の構成 / `k` `kan` 古文・漢文の要否 / `ri` 理系での扱い
 *   理科   `time` 試験時間と配点 / `fix` 学部ごとの科目指定 / `med` 医学科の条件 / `bun` 文系学部の扱い
 *   社会   `time` 試験時間 / 科目別の選択可否 / `n2` 二次の科目数 / `kyote_bun` `kyote_ri` 共通テストの科目数
 *
 * これらは診断（assets/js/subject-*.js）では使われていたのに、ページには
 * 出ていなかった。**私立の方式差も、医学部医学科の別扱いも、ここに書いてある。**
 * 値の読み方は各科目の `resolveUni()` と同じにする（食い違わせない）。
 *
 * ## slug は台帳で固定する
 *
 * `build/data/university-slugs.json` が正本。エイリアスから正規表現で導出しない。
 * 導出にすると、エイリアスを 1 語足しただけで URL が変わり、公開済みの
 * ページが 404 になる。台帳に無い大学・台帳にあるのにデータに無い大学は落とす。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBJECTS, ORIGIN, esc, clip } from './lib/extract.mjs';
import { NON_TRACK, trackKeys, trackLabel, groupTracks } from './lib/tracks.mjs';
import { beforeRoute, beforeSentence } from './lib/route-start.mjs';
import { tierGroup } from './lib/tiers.mjs';
import { loadUniversitySources } from './lib/university-sources.mjs';
import { loadSubjectData } from './lib/load-subject-data.mjs';
import { head, topBars, portalHeader, crumbs, footer, jsonLd, breadcrumbLd, shareBar } from './lib/parts.mjs';
import { adUnit } from './lib/ads.mjs';
import { isPlaceholder, placeholderSearchUrl } from './lib/record-type.mjs';
import { recordDate, saveDates } from './lib/updated.mjs';
import { coverBox } from './lib/cover.mjs';
import { displayName } from './lib/booktitle.mjs';
import { matchFeatures, recommendBooks, availableTracks } from './lib/uni-picks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** ルートを持つ 5 科目だけを扱う（情報・小論文は志望レベルの定義を持たない） */
const ROUTE_SUBJECTS = SUBJECTS.filter(s => !s.catalogOnly);

/**
 * 志望レベルの並び順は tier の `no`（"01"〜"09"）に従う。
 * ここに独自の順序を持たない。持つと、一覧の見出しに出る LEVEL 番号が
 * 07 → 06 → 04 と飛び、科目トップの志望レベル一覧（ROUTE 01…）とも食い違う。
 */
function tierRank(t) {
  const n = Number(t && t.no);
  return Number.isFinite(n) ? n : 99;
}

/**
 * 志望レベルの表示。科目をまたいで共通の帯の名前を主に出し、科目固有の名前を小さく添える
 * （「早慶上智 <small>早慶理工・上智・理科大</small>」。build/lib/tiers.mjs の TIER_GROUP）
 */
function tierLabel(tier) {
  const g = tierGroup(tier.id);
  if (!g) return esc(tier.name);
  return g === tier.name ? esc(g) : `${esc(g)}<small>${esc(tier.name)}</small>`;
}

/** 1 科目あたりに出すおすすめ参考書の上限（トラックを分けないとき） */
const MAX_BOOKS_PER_SUBJECT = 6;
/** トラック（文系・理系、物理・化学…）ごとに分けて出すときの 1 トラックあたりの上限 */
const MAX_BOOKS_PER_TRACK = 4;

/* ============================================================
   データの読み込み
   ============================================================ */

const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'data', 'university-slugs.json'), 'utf8'));
/** 出典（年度・確認日・公式 URL・学部×方式）。登録の無い大学は undefined */
const SOURCES = loadUniversitySources();

const data = {};
const counts = {};
for (const s of SUBJECTS) {
  data[s.dir] = loadSubjectData(ROOT, s.dir);
  counts[s.dir] = data[s.dir].books.length;
}

/**
 * 台帳と科目データを突き合わせる。
 * **食い違いは黙って飛ばさず落とす。** 飛ばすと、大学を 1 校足したときに
 * 台帳へ書き忘れてもビルドが通ってしまい、ページだけが永久にできない。
 */
function resolveUniversities() {
  const problems = [];
  const slugs = new Set();
  const out = [];

  for (const row of ledger.universities) {
    if (!/^[a-z0-9-]+$/.test(row.slug)) problems.push(`slug が URL に使えない文字を含む: ${row.slug}`);
    if (slugs.has(row.slug)) problems.push(`slug が重複している: ${row.slug}`);
    slugs.add(row.slug);

    const perSubject = [];
    for (const sub of ROUTE_SUBJECTS) {
      const d = data[sub.dir];
      const u = d.unis.find(x => x.n === row.name);
      if (!u) continue;
      const tier = d.tiers.find(t => t.id === u.t);
      if (!tier) { problems.push(`${row.name}（${sub.dir}）の志望レベル「${u.t}」に対応する tier が無い`); continue; }
      perSubject.push({ sub, u, tier });
    }

    if (perSubject.length !== ROUTE_SUBJECTS.length) {
      problems.push(`${row.name}: 5 科目そろっていない（${perSubject.length} 科目）。`
        + '台帳から外すか、universities.json を埋めること');
      continue;
    }
    if (perSubject[0].u.t !== row.tier) {
      problems.push(`${row.name}: 台帳の tier「${row.tier}」がデータの「${perSubject[0].u.t}」と違う`);
    }
    out.push({ slug: row.slug, name: row.name, tier: row.tier, perSubject });
  }

  // 逆向き。5 科目そろっているのに台帳に無い大学を出す
  const listed = new Set(ledger.universities.map(r => r.name));
  const seen = new Map();
  for (const sub of ROUTE_SUBJECTS) {
    for (const u of data[sub.dir].unis) seen.set(u.n, (seen.get(u.n) || 0) + 1);
  }
  for (const [name, n] of seen) {
    if (n === ROUTE_SUBJECTS.length && !listed.has(name)) {
      problems.push(`${name}: 5 科目そろっているのに build/data/university-slugs.json に無い`);
    }
  }

  if (problems.length) {
    console.error('大学別ページを生成できない:');
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  return out;
}

/* ============================================================
   その大学におすすめの参考書
   ============================================================ */

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
function pickBooks(d, sub, u, tierId, isMed) {
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
function uniText(u) {
  return [u.no, u.time, u.fix, u.med, u.bun, ...(u.fx || [])].filter(Boolean).join(' ');
}

/** その志望レベルのルートが収録している総冊数（重複を除く） */
function tierBookCount(d, tierId) {
  const node = d.routes[tierId] || {};
  const ids = new Set();
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (!v) continue;
    if (NON_TRACK.has(k)) {
      if (Array.isArray(v)) v.forEach(s => ids.add(s.id));
      else for (const kk of Object.keys(v)) if (Array.isArray(v[kk])) v[kk].forEach(s => ids.add(s.id));
      continue;
    }
    for (const p of ['omni', 'quick']) (v[p] || []).forEach(s => ids.add(s.id));
  }
  return ids.size;
}

/* ============================================================
   購入導線（過去問）
   ============================================================ */

/**
 * 過去問（赤本）の導線。
 *
 * **特定の商品へ直リンクしない。** 何年度版を買うか、どの学部の冊子かは
 * 受験する人にしか決められない（`build/lib/record-type.mjs` の経緯を参照。
 * ルート上の「志望校の過去問」枠に東大の赤本の ISBN が入っていた誤りを直した）。
 * ここでは大学名を検索語に入れた検索結果へ送る。書籍ページの枠と違って、
 * このページは大学が確定しているので**検索語に大学名を入れられる**。
 */
function kakomonLinks(name, config) {
  const az = placeholderSearchUrl('赤本 過去問', name);
  const azUrl = config.amazonTag ? `${az}&tag=${config.amazonTag}` : az;

  let rkUrl = '';
  if (config.rakutenId) {
    const dest = `https://search.rakuten.co.jp/search/mall/${name} 赤本/`;
    const e = encodeURIComponent(dest);
    rkUrl = `https://hb.afl.rakuten.co.jp/hgc/${config.rakutenId}/?pc=${e}&m=${e}`;
  }
  return { azUrl, rkUrl };
}

/* ============================================================
   入試方式の違い（国公立 / 私立 / 医学部）
   ============================================================ */

/** perSubject から 1 科目を引く。5 件しか無いので線形で足りる */
const bySub = (perSubject, dir) => perSubject.find(p => p.sub.dir === dir);

/**
 * 区分ごとの、入試の組み立ての違い。
 *
 * ここに書くのは**どの大学にも当てはまる一般的な事実**だけにする。
 * 大学固有の話は `universities.json` の `time` / `fix` / `med` にしか無いので、
 * 固有の記述はそちらを出す（作文で埋めない）。
 */
const KIND_NOTES = {
  国立: '国公立大学は、共通テストと個別試験（二次）の二段構えです。共通テストは科目数が多い代わりに'
    + '出題形式が固定されていて、個別試験は科目が絞られる代わりに記述の比重が上がります。'
    + 'どちらの配点が重いかは学部・日程で変わるので、募集要項の配点表を先に見てから、'
    + '下の科目別の説明を読んでください。',
  公立: '公立大学も共通テストと個別試験の二段構えですが、個別試験の科目数を絞る大学が多く、'
    + '共通テストの比重が国立より重くなりやすい傾向があります。中期日程を実施する大学もあるため、'
    + '日程と配点を募集要項で確認したうえで、下の科目別の説明を読んでください。',
  私立: '私立大学は、同じ大学でも入試方式によって問題そのものが変わります。学部別日程は'
    + '学部ごとに作られた独自問題で、出題傾向も時間配分もそこで決まります。全学部統一方式は'
    + '複数学部を 1 つの問題で選抜するため標準的な構成になりやすく、取りこぼしが直接響きます。'
    + '共通テスト利用方式は個別試験を課さない代わりに高い得点率が必要です。'
    + '下の科目別の説明にある「試験の構成」は方式ごとに書き分けてあるので、'
    + '受ける方式を決めてから読んでください。',
};

/**
 * 医学部医学科の別扱い。
 *
 * 判定材料は 2 つだけで、どちらもデータに書いてあるもの。
 *   - 理科の `med`（医学科の科目指定。書いてある＝医学科がある）
 *   - 志望レベルが med / shiritsui（医学部単科大学として登録されている）
 *
 * **大学名に「医」が入るかどうかでは判定しない。** 医療系学部だけを持つ大学まで
 * 巻き込み、医学科向けの参考書が並んでしまう。
 */
function medicalInfo(perSubject) {
  const sc = bySub(perSubject, 'science');
  const ja = bySub(perSubject, 'japanese');
  const so = bySub(perSubject, 'social');
  const tierMed = perSubject.some(p => p.u.t === 'med' || p.u.t === 'shiritsui');
  const med = sc && sc.u.med ? sc.u.med : '';
  if (!med && !tierMed) return null;

  const notes = [];
  if (med) notes.push({ dt: '理科の科目指定（医学科）', dd: med });
  if (ja && ja.u.ri === 2) notes.push({ dt: '国語（医学科）', dd: '理系学部で唯一、医学部医学科には個別試験の国語が課されます。' });
  if (so && so.u.ri === 2) notes.push({ dt: '社会（医学科）', dd: '理系学部で唯一、医学部医学科には個別試験の社会が課されます。' });
  return { tierMed, notes };
}

/**
 * 個別試験（二次）でその科目が課されるか。
 * 値の読み方は各科目の診断（assets/js/subject-*.js の resolveUni）と同じ。
 * 英語・数学は可否を持つフィールドが無いので**行に出さない**（推測で埋めない）。
 */
function secondStageRows(perSubject) {
  const rows = [];
  const ja = bySub(perSubject, 'japanese');
  const sc = bySub(perSubject, 'science');
  const so = bySub(perSubject, 'social');
  /* 試験の構成（time）は科目の節の「試験の構成」に出している。ここで同じ文を
     もう一度出すと 1 ページに同じ文が 2 回並ぶので、可否だけを出して節へ送る（仕様書 2.6） */
  if (ja) rows.push({ name: '国語', dir: 'japanese', has: ja.u.g !== 0 });
  if (sc) rows.push({ name: '理科', dir: 'science', has: sc.u.need !== 0 });
  if (so) rows.push({ name: '社会', dir: 'social', has: so.u.n2 !== 0 });
  return rows;
}

/** 科目内で選べる分野（古文・漢文／物理・化学…／日本史・世界史…）の可否 */
const AVAIL_MAP = {
  japanese: [['gendai', u => 1], ['kobun', u => u.k], ['kanbun', u => u.kan]],
  science:  [['butsuri', u => u.p], ['kagaku', u => u.c], ['seibutsu', u => u.b], ['chigaku', u => u.g]],
  social:   [['nihonshi', u => u.nihonshi], ['sekaishi', u => u.sekaishi], ['chiri', u => u.chiri],
             ['kokyo', u => u.kokyo], ['seikei', u => u.seikei], ['rinri', u => u.rinri]],
};

/** 「日本史・世界史・地理が出題されます。公民は出題されません。」を作る */
function availNote(d, dir, u) {
  const rows = AVAIL_MAP[dir];
  if (!rows) return '';
  const ok = [], some = [], no = [];
  for (const [k, f] of rows) {
    const v = f(u);
    const label = trackLabel(d, k);
    if (v === 2) some.push(label);
    else if (v) ok.push(label);
    else no.push(label);
  }
  const parts = [];
  if (ok.length) parts.push(`${ok.join('・')}が出題されます`);
  if (some.length) parts.push(`${some.join('・')}は学部・入試方式によって扱いが変わります`);
  if (no.length) parts.push(`${no.join('・')}は出題されません`);
  return parts.length ? `${parts.join('。')}。` : '';
}

/** 社会だけが持つ、共通テストで必要な科目数 */
function kyoteNote(u) {
  const b = u.kyote_bun, r = u.kyote_ri;
  if (!b && !r) return '';
  const parts = [];
  if (b) parts.push(`文系は${b}科目`);
  if (r) parts.push(`理系は${r}科目`);
  return `共通テストで必要なのは${parts.join('、')}です。`;
}

/* ============================================================
   1 校ぶんのページ
   ============================================================ */

function renderUniversity(uni, all, config) {
  const { slug, name, perSubject } = uni;
  const url = `${ORIGIN}/univ/${slug}/`;
  const tier = perSubject[0].tier;
  const kind = perSubject[0].u.ty || '';

  /* 更新日は「読者に見える中身が変わった日」。大学のデータと台帳の slug が
     材料で、サイト全体の再生成では動かない（build/lib/updated.mjs の方針） */
  const src = SOURCES[slug];
  const updated = recordDate(`univ/${slug}`, {
    slug, name,
    subjects: perSubject.map(p => ({ dir: p.sub.dir, t: p.u.t, h: p.u.h, no: p.u.no, fx: p.u.fx })),
    ...(src ? { src } : {}),
  });

  /* 出典。**確かめた大学だけ**年度・確認日・公式サイトを出す。登録の無い大学に
     年度を推測で書かない（build/data/university-sources.json、build/lib/university-sources.mjs） */
  const sourceLine = src
    /* 「選抜要項」と書かない。私立の多くは確認時点で要項の本体が未公開で、公表されていたのは
       入試の概要・科目と配点だったため（2026-09-10 の確認） */
    ? `<p class="usource">出典: ${esc(name)}の${src.year}年度入試の公表資料（選抜要項・入試概要など。${esc(src.checked)} 確認） <a rel="nofollow noopener noreferrer" target="_blank" href="${esc(src.url)}">公式サイト</a></p>`
    : '<p class="usource">出題形式は年度により変わります。出願前に募集要項で確認してください。</p>';
  const faculties = src && Array.isArray(src.faculties) && src.faculties.length ? src.faculties : null;
  const facultyTable = faculties ? `      <div class="ufac-wrap" tabindex="0" role="region" aria-label="${esc(name)}の学部と入試方式の表（横にスクロールできます）">
        <table class="ufac">
          <caption>${esc(name)}の学部と入試方式（${src.year}年度。大学公式の公表資料から、確かめられた学部・方式だけを載せています。${esc(src.checked)} 確認）</caption>
          <thead><tr><th scope="col">学部</th><th scope="col">方式</th><th scope="col">科目</th><th scope="col">備考</th></tr></thead>
          <tbody>
${faculties.map(f => `            <tr><th scope="row">${esc(f.name)}</th><td>${esc(f.method)}</td><td>${esc(f.subjects)}</td><td>${esc(f.note || '')}</td></tr>`).join('\n')}
          </tbody>
        </table>
      </div>` : '';

  const med = medicalInfo(perSubject);

  const sections = perSubject.map(p => {
    const d = data[p.sub.dir];
    const { lists, tracks, limited, features } = pickBooks(d, p.sub, p.u, p.u.t, !!med);
    const nBooks = lists.reduce((a, l) => a + l.books.length, 0);
    const total = tierBookCount(d, p.u.t);
    const routeUrl = `/${p.sub.dir}/routes/${p.u.t}/`;
    const fx = Array.isArray(p.u.fx) ? p.u.fx : [];
    const stages = d.stages || {};
    const groups = groupTracks(d.routes[p.u.t], tracks);

    /* ルートの先頭の本が難しいときは、その前にやる段階を 1 行添える（ルートページと同じ文）。
       本編が違うトラックで同じ本から始まるなら 1 回だけ */
    /* 出題形式別の重点対策（focus.json）。大学の fx に書いてある形式だけを出す */
    const focusRows = fx.map(k => ({ key: k, f: (d.focus || {})[k] })).filter(x => x.f);
    const bookLink = (id) => {
      const b = d.books.find(x => x.id === id);
      return b ? `<a href="/${p.sub.dir}/books/${b.id}/">${esc(displayName(b, p.sub.dir))}</a>` : '';
    };
    const focusHtml = focusRows.length ? `      <h3 class="usec__h3">${esc(name)}の出題形式に合わせた重点対策</h3>
      <p class="usec__note">ルートの本編とは別に、${esc(name)}の${esc(p.sub.ja)}で出る形式に対して追加する枠です。</p>
      <ul class="ufocus">
${focusRows.map(({ key, f }) => {
    const b = d.books.find(x => x.id === f.id);
    if (!b) return '';
    const st = stages[b.stage] || {};
    const alts = (f.alts || []).map(bookLink).filter(Boolean);
    return `        <li class="ubook">
          <a class="ubook__cov" href="/${p.sub.dir}/books/${b.id}/" tabindex="-1" aria-hidden="true">${coverBox(b, { color: st.color || p.sub.color, dir: p.sub.dir })}</a>
          <div class="ubook__body">
            <span class="ubook__tag">重点:${esc(key)}</span>
            <a class="ubook__name" href="/${p.sub.dir}/books/${b.id}/">${esc(displayName(b, p.sub.dir))}</a>
            <span class="ubook__meta">${esc(b.pub || '')}／難易度 ${b.diff}${b.hensachi ? `／${esc(b.hensachi)}` : ''}</span>
            <span class="ubook__why">${esc(f.note)}</span>
${alts.length ? `            <span class="ubook__note">代わりに使える本：${alts.join('、')}</span>` : ''}
          </div>
        </li>`;
  }).filter(Boolean).join('\n')}
      </ul>
` : '';

    const seenStart = new Set();
    const befores = groups.map(g => ({ g, b: beforeRoute(d, p.u.t, g) }))
      .filter(x => x.b && !seenStart.has(x.b.book.id) && seenStart.add(x.b.book.id));

    /* 出題の事実。**データに入っている行だけ**を出す。
       空のフィールドを「—」で埋めると、調べていないのか無いのかが読者に伝わらない */
    const facts = [];
    if (p.u.time) facts.push({ dt: '試験の構成', dd: p.u.time });
    facts.push({ dt: '出題の特徴', dd: p.u.no
      || '公表されている情報から特定できていません。募集要項と過去問で確認してください。' });
    const avail = availNote(d, p.sub.dir, p.u);
    if (avail) facts.push({ dt: '出題される分野', dd: avail });
    if (p.u.fix) facts.push({ dt: '学部ごとの科目指定', dd: p.u.fix });
    /* 医学科の条件は上の「医学部医学科について」の節に同じ文で出している。
       ここでもう一度出すと 1 ページに同じ文が 2 回並ぶので、節へ送る（仕様書 2.6） */
    if (p.u.med) facts.push({ dt: '医学部医学科の場合', html: `上の<a href="#med">「${esc(name)}の医学部医学科について」</a>にまとめています。` });
    if (p.u.bun) facts.push({ dt: '文系学部の場合', dd: p.u.bun });
    const kyote = p.sub.dir === 'social' ? kyoteNote(p.u) : '';
    if (kyote) facts.push({ dt: '共通テスト', dd: kyote });
    facts.push({ dt: '目標の目安', dd: `偏差値 ${p.u.h} 前後${fx.length ? `／${fx.join('・')}` : ''}` });

    return `    <section class="block usec" id="sub-${p.sub.dir}" style="--sc:${p.sub.color}">
      <div class="eyebrow">${esc(p.sub.en)}</div>
      <h2 class="sec">${esc(name)}の${esc(p.sub.ja)}</h2>
      <dl class="ufacts">
${facts.map(f => `        <div><dt>${esc(f.dt)}</dt><dd>${f.html ?? esc(f.dd)}</dd></div>`).join('\n')}
      </dl>
${features.length ? `      <h3 class="usec__h3">ここで問われる力と、その対策</h3>
      <p class="usec__note">${esc(name)}の${esc(p.sub.ja)}の説明に出てくる出題の要素を取り出したものです。</p>
      <ul class="upoints">
${features.map(f => `        <li><b>${esc(f.key)}</b><span>${esc(f.tip)}</span></li>`).join('\n')}
      </ul>
` : ''}${focusHtml}${nBooks ? `      <h3 class="usec__h3">${esc(name)}におすすめの参考書</h3>
      <p class="usec__note">${esc(p.tier.name)}の${esc(p.sub.ja)}ルートに入っている本${focusRows.length ? 'と出題形式別の重点対策の本' : ''}のうち、上に挙げた出題の特徴と噛み合うものを${nBooks}冊選びました。${lists.length > 1 ? `${esc(lists.map(l => l.label).join('・'))}に分けて出しています。` : ''}進める順番ではないので、順番は${esc(p.sub.ja)}のルートを見てください。</p>
${lists.map(l => `${l.label ? `      <h4 class="ubooks__h">${esc(l.label)}${l.limited ? '<span> — 学部・入試方式による</span>' : ''}</h4>
` : ''}      <ul class="ubooks">
${l.books.map(b => {
    const st = stages[b.book.stage] || {};
    /* トラック名は、1 つのリストに複数のトラックを混ぜていて、その本が
       「一部のトラックにしか載っていない」ときだけ出す。全トラックに載っている本に
       トラック名を書くと、他のトラックの読者が読み飛ばす */
    const tl = (!l.label && tracks.length > 1 && b.tracks.length && b.tracks.length < tracks.length)
      ? b.tracks.map(t => trackLabel(d, t, 'short')).join('・') : '';
    const why = [b.role, ...b.reasons.slice(0, 3)].filter(Boolean).join('／');
    const also = b.also && b.also.length ? `（${b.also.join('・')}でも使う）` : '';
    return `        <li class="ubook">
          <a class="ubook__cov" href="/${p.sub.dir}/books/${b.book.id}/" tabindex="-1" aria-hidden="true">${coverBox(b.book, { color: st.color || p.sub.color, dir: p.sub.dir })}</a>
          <div class="ubook__body">
            <span class="ubook__tag">${[tl, st.label || ''].filter(Boolean).map(esc).join('／')}</span>
            <a class="ubook__name" href="/${p.sub.dir}/books/${b.book.id}/">${esc(displayName(b.book, p.sub.dir))}</a>${also ? `<span class="ubook__also">${esc(also)}</span>` : ''}
            <span class="ubook__meta">${esc(b.book.pub || '')}／難易度 ${b.book.diff}${b.book.hensachi ? `／${esc(b.book.hensachi)}` : ''}</span>
${why ? `            <span class="ubook__why">${esc(why)}</span>` : ''}
${b.note ? `            <span class="ubook__note">${esc(b.note)}</span>` : ''}
          </div>
        </li>`;
  }).join('\n')}
      </ul>`).join('\n')}
` : ''}      <p class="usec__more"><a href="${routeUrl}">${esc(p.tier.name)}の${esc(p.sub.ja)}参考書ルート（全${total}冊）を見る</a>${groups.length > 1 ? `<span class="usec__tracks">${tracks.map(t => esc(trackLabel(d, t, 'short'))).join('・')}別に用意しています${limited.length ? `。${limited.map(t => esc(trackLabel(d, t, 'short'))).join('・')}は学部・入試方式によって扱いが変わります` : ''}</span>` : ''}</p>
${befores.map(x => `      <p class="usec__before">${beforeSentence(d, x.g, x.b)}</p>`).join('\n')}
    </section>`;
  }).join('\n\n');

  // 同じ志望レベルの他大学（内部リンク。多すぎると読めないので 24 校で切る）
  const siblings = all.filter(x => x.tier === uni.tier && x.slug !== slug).slice(0, 24);

  const stageRows = secondStageRows(perSubject);
  const { azUrl, rkUrl } = kakomonLinks(name, config);

  const hs = perSubject.map(p => p.u.h).filter(h => typeof h === 'number');

  const title = clip(`${name}の参考書ルート｜全科目の出題傾向と対策 - ルート大全`, 60);
  const desc = clip(`${name}（${tier.sub}）の入試対策。英語・国語・数学・理科・社会それぞれの出題形式・試験時間・目標偏差値と、`
    + `その出題に合わせて選んだおすすめの参考書をまとめています。${med ? '医学部医学科の条件も別に載せています。' : ''}`, 120);

  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: '志望校から探す', url: '/univ/', absUrl: `${ORIGIN}/univ/` },
    { name, url, absUrl: url },
  ];

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: `${name}の参考書ルート`,
        description: desc,
        inLanguage: 'ja',
        author: { '@type': 'Organization', name: 'ルート大全 編集部' },
        publisher: { '@type': 'Organization', name: 'ルート大全 編集部' },
        mainEntityOfPage: url,
        about: { '@type': 'CollegeOrUniversity', name },
      },
      {
        '@type': 'WebPage',
        dateModified: updated,
        '@id': `${url}#webpage`,
        url, name: title, description: desc, inLanguage: 'ja',
        isPartOf: { '@id': `${ORIGIN}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc, url, ogImage: `${ORIGIN}/assets/ogp/univ/${slug}.png` })}
<style>
:root{--sc:${tier.color || '#5B4E9E'}}
.uhead{display:flex;flex-wrap:wrap;gap:1px;background:var(--line);border:1px solid var(--line);margin-top:20px;box-shadow:var(--sh-s)}
.uhead div{background:var(--surface);padding:15px 18px;flex:1 1 160px}
.uhead dt{font-size:10.5px;color:var(--muted);font-weight:700;letter-spacing:.05em}
.uhead dd{font-size:14px;color:var(--ink);font-weight:700;margin-top:5px;line-height:1.5}
.unav{display:flex;flex-wrap:wrap;gap:7px;margin-top:18px}
.unav a{background:var(--surface);border:1px solid var(--line);padding:10px 14px;font-size:12.5px;font-weight:700;color:var(--ink-2);transition:.15s;box-shadow:var(--sh-s)}
.unav a:hover{transform:translateY(-2px);box-shadow:var(--sh-m);border-color:var(--line-d)}
/* 科目の色の縦線と本文の間。ここを 0 にすると、線のすぐ横から文字が始まって窮屈に見える。
   左の余白は縦線の太さ（3px）とは別に取る */
.usec{border-left:3px solid var(--sc);padding:2px 0 4px 16px}
@media(min-width:700px){.usec{padding-left:22px}}
.ufacts{display:flex;flex-direction:column;gap:1px;background:var(--line);border:1px solid var(--line);margin-top:16px}
.ufacts div{background:var(--surface);padding:14px 17px}
.ufacts dt{font-size:10.5px;color:var(--muted);font-weight:700;letter-spacing:.05em}
.ufacts dd{font-size:13.5px;color:var(--ink);margin-top:6px;line-height:1.85}
.ufacts dd a{color:var(--indigo);font-weight:700;text-decoration:underline;text-underline-offset:2px}
.usec__h3{font-family:var(--serif);font-weight:800;font-size:14.5px;letter-spacing:.03em;margin-top:24px}
.usec__note{font-size:12px;color:var(--muted);line-height:1.85;margin-top:7px;max-width:44em}
.upoints{list-style:none;margin-top:12px;display:flex;flex-direction:column;gap:1px;background:var(--line);border:1px solid var(--line)}
.upoints li{background:var(--surface);padding:13px 16px}
.upoints b{display:block;font-size:12.5px;font-weight:800;color:var(--sc);letter-spacing:.02em}
.upoints span{display:block;font-size:12.5px;color:var(--ink-2);line-height:1.9;margin-top:5px}
.ubooks__h{font-size:12.5px;font-weight:800;color:var(--sc);letter-spacing:.03em;margin-top:16px}
.ubooks__h span{font-weight:700;color:var(--muted)}
.ubook__also{display:block;font-size:11px;color:var(--muted);margin-top:2px}
.ufocus{list-style:none;margin-top:12px;display:grid;grid-template-columns:1fr;gap:1px;background:var(--line);border:1px solid var(--line)}
@media(min-width:720px){.ufocus{grid-template-columns:repeat(2,1fr)}}
.ubook__note a{color:var(--indigo);font-weight:700;text-decoration:underline;text-underline-offset:2px}
.ubooks{list-style:none;margin-top:12px;display:grid;grid-template-columns:1fr;gap:1px;background:var(--line);border:1px solid var(--line)}
@media(min-width:720px){.ubooks{grid-template-columns:repeat(2,1fr)}}
.ubook{display:flex;gap:13px;background:var(--surface);padding:13px 15px}
.ubook__cov{flex:none;--cw:52px;display:block}
.ubook__body{min-width:0}
.ubook__tag{display:block;font-family:var(--mono);font-size:10px;color:var(--muted-2);letter-spacing:.04em}
.ubook__name{display:block;font-size:13.5px;font-weight:700;color:var(--ink);line-height:1.5;margin-top:3px;text-decoration:underline;text-decoration-color:var(--line-d);text-underline-offset:3px}
.ubook__name:hover{color:var(--accent-deep)}
.ubook__meta{display:block;font-family:var(--mono);font-size:10.5px;color:var(--muted-2);margin-top:4px;letter-spacing:.03em}
.ubook__why{display:block;font-size:11.5px;color:var(--ink-2);line-height:1.7;margin-top:6px}
.ubook__note{display:block;font-size:11.5px;color:var(--muted);line-height:1.7;margin-top:4px}
.unote{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--indigo);padding:17px 20px;margin-top:16px}
.unote p{font-size:13px;color:var(--ink-2);line-height:1.95}
.unote dl{display:flex;flex-direction:column;gap:1px;background:var(--line);border:1px solid var(--line);margin-top:14px}
.unote dl>div{background:var(--surface);padding:12px 15px}
.unote dt{font-size:10.5px;color:var(--muted);font-weight:700;letter-spacing:.05em}
.unote dd{font-size:13px;color:var(--ink);margin-top:5px;line-height:1.85}
.unote__go{margin-left:10px;font-size:12px;font-weight:700;color:var(--indigo);text-decoration:underline;text-underline-offset:2px;padding:4px 0;display:inline-block}
.usource{font-size:11.5px;color:var(--muted);line-height:1.8;margin-top:6px}
.usource a{color:var(--indigo);font-weight:700;text-decoration:underline;text-underline-offset:2px;padding:4px 0;display:inline-block}
.ufac-wrap{overflow-x:auto;margin-top:16px;border:1px solid var(--line);box-shadow:var(--sh-s);background:var(--surface)}
.ufac{border-collapse:collapse;width:100%;min-width:560px;font-size:12.5px}
.ufac caption{text-align:left;font-size:11.5px;color:var(--muted);padding:10px 14px 0;caption-side:top}
.ufac th,.ufac td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--line-2);vertical-align:top;line-height:1.65}
.ufac thead th{background:var(--surface-2);font-size:11px;color:var(--muted);font-weight:700;white-space:nowrap}
.ufac tbody th{font-weight:700;color:var(--ink);white-space:nowrap}
.ufac tr:last-child th,.ufac tr:last-child td{border-bottom:none}
.usec__more{margin-top:18px;font-size:13px;line-height:1.8}
.usec__more a{font-weight:700;color:var(--indigo);text-decoration:underline;text-underline-offset:3px;padding:4px 0;display:inline-block}
.usec__tracks{display:block;font-size:11.5px;color:var(--muted);margin-top:3px}
.usec__before{font-size:12px;color:var(--ink-2);line-height:1.85;margin-top:8px;max-width:44em}
.usec__before a{color:var(--indigo);font-weight:700;text-decoration:underline;text-underline-offset:2px}
.uhensa{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--sh-s)}
.uhensa th,.uhensa td{padding:11px 14px;border-bottom:1px solid var(--line);text-align:left}
.uhensa th{font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.04em;background:var(--surface-2)}
.uhensa td{font-weight:700;color:var(--ink)}
.uhensa td.mono{font-family:var(--mono);font-weight:600;color:var(--ink-2)}
.uhensa tr:last-child th,.uhensa tr:last-child td{border-bottom:none}
.uhensa td.utier small,.uhead dd small{display:block;font-size:11px;color:var(--muted);font-weight:600;margin-top:2px;letter-spacing:.02em}
.ubuy{background:var(--surface-2);border:1px solid var(--line);border-left:3px solid var(--gold);padding:19px 21px;margin-top:18px}
.ubuy p{font-size:12.5px;color:var(--ink-2);line-height:1.85;margin-top:8px}
.ubuy__btns{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}
.ubuy__btns a{font-size:12.5px;font-weight:700;padding:11px 17px;border:1px solid var(--line-d);background:var(--surface);color:var(--ink);transition:.15s;box-shadow:var(--sh-s)}
.ubuy__btns a:hover{transform:translateY(-2px);box-shadow:var(--sh-m)}
.usibs{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px}
.usibs a{font-size:12px;font-weight:700;color:var(--ink-2);background:var(--surface);border:1px solid var(--line);padding:6px 12px;box-shadow:var(--sh-s);transition:.15s}
.usibs a:hover{transform:translateY(-2px);box-shadow:var(--sh-m);color:var(--accent-deep)}
</style>
</head>
<body>

${topBars('')}

${portalHeader()}

<main class="wrap">
  ${crumbs(crumbItems)}

  <div class="block" style="margin-top:26px">
    <div class="eyebrow">University</div>
    <h1 class="sec" style="font-size:29px">${esc(name)}の参考書ルート</h1>
    <p class="sec-lead">${esc(name)}（${esc(kind)}／${esc(tier.sub)}）を目指すときに、英語・国語・数学・理科・社会でそれぞれ何がどう問われるかと、その出題に噛み合う参考書をまとめたページです。${med ? '医学部医学科は他学部と条件が変わるので、別に節を設けています。' : ''}学部・入試方式によって使う科目と配点は変わるので、必ず募集要項と併せて確認してください。</p>
    <p class="page-updated">最終更新: <time datetime="${updated}">${updated}</time></p>
    ${sourceLine}
    <dl class="uhead">
      <div><dt>志望レベル</dt><dd>${tierLabel(tier)}</dd></div>
      <div><dt>区分</dt><dd>${esc(kind || '—')}</dd></div>
      <div><dt>目標の目安</dt><dd>${hs.length ? `偏差値 ${Math.min(...hs)}〜${Math.max(...hs)}` : '—'}</dd></div>
    </dl>
    <div class="unav">
      <a href="#exam">入試の組み立て</a>
${med ? '      <a href="#med">医学部医学科</a>\n' : ''}${perSubject.map(p => `      <a href="#sub-${p.sub.dir}">${esc(p.sub.ja)}</a>`).join('\n')}
    </div>
    ${shareBar({
      url,
      head: 'SHARE — このページを共有する',
      text: `【ルート大全】${name}の参考書ルート（全科目の出題傾向と使う参考書）`,
    })}
  </div>

  <section class="block" id="exam">
    <div class="eyebrow">Exam format</div>
    <h2 class="sec">${esc(name)}の入試はどう組み立てられているか</h2>
    <p class="sec-lead">科目別の対策に入る前に、${esc(name)}の入試がどういう形で行われるかを押さえておきます。ここが分かっていないと、同じ大学の別方式の過去問を解いて手応えを取り違えます。</p>
${facultyTable}
    <div class="unote">
      <p>${esc(KIND_NOTES[kind] || '入試の組み立ては募集要項で確認してください。')}</p>
${stageRows.length ? `      <dl>
${stageRows.map(r => `        <div><dt>個別試験（二次）の${esc(r.name)}</dt><dd>${r.has ? '課されます。' : '課されません。'}<a class="unote__go" href="#sub-${r.dir}">詳しくは${esc(r.name)}の節へ</a></dd></div>`).join('\n')}
      </dl>
      <p style="margin-top:12px">英語と数学は、学部・学科によって課されるかどうかも配点も大きく変わるため、ここでは可否を出していません。科目別の説明と募集要項で確認してください。</p>` : ''}
    </div>
  </section>

${med ? `  <section class="block" id="med">
    <div class="eyebrow">Medical</div>
    <h2 class="sec">${esc(name)}の医学部医学科について</h2>
    <p class="sec-lead">医学部医学科は、同じ大学の他学部と同じ問題を使う場合でも、合格に必要な得点率が大きく上がります。理科の科目指定が別に決められていたり、面接・小論文が課されたりするのも医学科の特徴です。私立の医科大学では、医学部だけの独自問題を作っている大学もあります。</p>
    <div class="unote">
      <p>このページの参考書は、科目ごとに${esc(perSubject.map(p => `${p.sub.ja}は${p.tier.name}`).join('、'))}のルートから選んでいます。${med.tierMed
        ? '医学科は科目によって求められる到達点が違うため、志望レベルも科目ごとに変えてあります。'
        : `${esc(name)}全体の志望レベルで選んでいるので、医学科を受けるなら、下に出している条件のぶんだけ到達点を上げて考えてください。`}</p>
${med.notes.length ? `      <dl>
${med.notes.map(n => `        <div><dt>${esc(n.dt)}</dt><dd>${esc(n.dd)}</dd></div>`).join('\n')}
      </dl>` : ''}
      <p style="margin-top:12px">面接・小論文の有無と配点、共通テストの必要科目は年度によって変わります。出願前に必ず募集要項で確認してください。小論文の対策は<a href="/shoron/">小論文ルート大全</a>にまとめています。</p>
    </div>
  </section>

` : ''}  <section class="block">
    <div class="eyebrow">Target level</div>
    <h2 class="sec">科目ごとの目標</h2>
    <p class="sec-lead">${esc(name)}で科目ごとに必要になる到達度の目安です。同じ大学でも学部・方式で配点が変わるため、数字は「どの科目に時間を厚く配るか」を決めるための相対的な目安として使ってください。算出のしかたは<a href="/methodology/">データの作り方</a>に書いています。</p>
    <table class="uhensa">
      <tr><th scope="col">科目</th><th scope="col">目標偏差値</th><th scope="col">志望レベル</th></tr>
${perSubject.map(p => `      <tr><th scope="row">${esc(p.sub.ja)}</th><td class="mono">${esc(String(p.u.h))}</td><td class="utier">${tierLabel(p.tier)}</td></tr>`).join('\n')}
    </table>
  </section>

  <div class="block unote unote--read">
    <p><b>科目ごとの節の読み方。</b>「ここで問われる力と、その対策」は、各科目の出題説明に出てくる要素のうち当てはまる項目だけを出しているので、書かれていない形式が出ないという意味ではありません。「おすすめの参考書」の並び順は、その大学の出題の特徴に当てはまった数と、ルート上の位置で決めています。</p>
  </div>

${sections}

  <section class="block">
    <div class="eyebrow">Past exams</div>
    <h2 class="sec">${esc(name)}の過去問</h2>
    <div class="ubuy">
      <p>ルートの最後は過去問です。${esc(name)}は学部・入試方式によって収録内容の違う冊子が出ているため、当サイトでは特定の 1 冊を指定していません。志望学部と年度を確かめてから選んでください。</p>
      <div class="ubuy__btns">
        <a href="${esc(azUrl)}" target="_blank" rel="nofollow sponsored noopener noreferrer">Amazon で「${esc(name)} 赤本」を探す</a>
${rkUrl ? `        <a href="${esc(rkUrl)}" target="_blank" rel="nofollow sponsored noopener noreferrer">楽天ブックスで探す</a>` : ''}
      </div>
    </div>
  </section>

  ${siblings.length ? `<section class="block">
    <div class="eyebrow">Same level</div>
    <h2 class="sec">同じ志望レベルの大学</h2>
    <p class="sec-lead">${esc(tier.name)}として扱っている他の大学です。併願先を決めるとき、必要な参考書がどれだけ重なるかの目安になります。</p>
    <div class="usibs">
${siblings.map(s => `      <a href="/univ/${s.slug}/">${esc(s.name)}</a>`).join('\n')}
    </div>
  </section>` : ''}

  <div class="cta">
    <h2>現在地から逆算したいときは</h2>
    <p>ここに出しているのは${esc(name)}を目標にした標準的な並びです。いま解ける問題のレベルや残り時間に合わせて調整したい場合は、各科目の 3 分診断を使ってください。</p>
    <div class="cta__btns">
      <a class="p" href="/univ/">他の大学も見る<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
      <a class="g" href="/">全科目のトップへ</a>
    </div>
  </div>${adUnit('bottom', '  ')}
</main>

${footer('', counts)}

${jsonLd(ld)}

</body>
</html>
`;
}

/* ============================================================
   一覧ページ
   ============================================================ */

function renderIndex(all) {
  const url = `${ORIGIN}/univ/`;
  const updated = recordDate('univ/index', all.map(u => `${u.slug}:${u.tier}`).join(','));

  // 志望レベルごとにまとめる。tier の表示名は英語科目の定義から引く（5 科目で共通）
  const groups = data.english.tiers
    .slice()
    .sort((a, b) => tierRank(a) - tierRank(b))
    .map(def => ({ def, list: all.filter(u => u.tier === def.id) }))
    .filter(g => g.list.length);

  const title = '志望校から探す 参考書ルート｜大学160校の出題傾向 - ルート大全';
  const desc = clip(`大学ごとの入試の出題形式と、そこから逆算した参考書ルートの一覧。`
    + `${all.length}校について、英語・国語・数学・理科・社会それぞれの目標と使う参考書をまとめています。`, 120);

  const crumbItems = [
    { name: 'ルート大全', url: '/', absUrl: `${ORIGIN}/` },
    { name: '志望校から探す', url, absUrl: url },
  ];

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumbLd(crumbItems, `${url}#breadcrumb`),
      {
        '@type': 'CollectionPage',
        dateModified: updated,
        '@id': `${url}#webpage`,
        url, name: title, description: desc, inLanguage: 'ja',
        isPartOf: { '@id': `${ORIGIN}/#website` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
      {
        '@type': 'ItemList',
        name: '志望校別の参考書ルート',
        numberOfItems: all.length,
        itemListElement: all.map((u, i) => ({
          '@type': 'ListItem', position: i + 1, name: `${u.name}の参考書ルート`,
          url: `${ORIGIN}/univ/${u.slug}/`,
        })),
      },
    ],
  };

  const sections = groups.map(g => `  <section class="block">
    <div class="eyebrow">${esc(g.def.no ? `LEVEL ${g.def.no}` : 'LEVEL')}</div>
    <h2 class="sec">${esc(g.def.name)}<span class="ucount">${g.list.length}校</span></h2>
    <p class="sec-lead">${esc(g.def.sub)}／${esc(g.def.hensachi)}。<a href="/english/routes/${g.def.id}/">この志望レベルの英語ルート</a>を起点に、各大学のページで科目ごとの出題形式を確認できます。</p>
    <div class="ugrid">
${g.list.map(u => `      <a href="/univ/${u.slug}/">${esc(u.name)}</a>`).join('\n')}
    </div>
  </section>`).join('\n\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
${head({ title, desc, url, ogImage: `${ORIGIN}/assets/ogp.png` })}
<style>
:root{--sc:#5B4E9E}
.ucount{font-family:var(--mono);font-size:11px;color:var(--muted);font-weight:600;margin-left:10px}
.ugrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);margin-top:16px;box-shadow:var(--sh-s)}
.ugrid a{background:var(--surface);padding:13px 15px;font-size:13px;font-weight:700;color:var(--ink);transition:.15s;line-height:1.5}
.ugrid a:hover{background:var(--surface-2);color:var(--accent-deep)}
</style>
</head>
<body>

${topBars('')}

${portalHeader()}

<main class="wrap">
  ${crumbs(crumbItems)}

  <div class="block" style="margin-top:26px">
    <div class="eyebrow">Universities</div>
    <h1 class="sec" style="font-size:29px">志望校から探す 参考書ルート</h1>
    <p class="sec-lead">大学${all.length}校について、英語・国語・数学・理科・社会それぞれで何が問われるかと、そこへ届くまでに使う参考書の順番をまとめています。志望校が決まっている人はここから、まだ決まっていない人は<a href="/english/routes/">志望レベル別のルート</a>から見てください。</p>
    <p class="page-updated">最終更新: <time datetime="${updated}">${updated}</time></p>
  </div>

${sections}

  <div class="cta">
    <h2>志望校がまだ決まっていないときは</h2>
    <p>志望校ではなく現在の学力から組み立てることもできます。各科目の 3 分診断に答えると、いまの位置から始められる並びが出ます。</p>
    <div class="cta__btns">
      <a class="p" href="/">科目を選ぶ<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
      <a class="g" href="/search/">参考書を検索する</a>
    </div>
  </div>${adUnit('bottom', '  ')}
</main>

${footer('', counts)}

${jsonLd(ld)}

</body>
</html>
`;
}

/* ============================================================
   実行
   ============================================================ */

const all = resolveUniversities();
const config = data.english.config || {};

const outRoot = path.join(ROOT, 'univ');
fs.mkdirSync(outRoot, { recursive: true });

for (const uni of all) {
  const dir = path.join(outRoot, uni.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), renderUniversity(uni, all, config));
}
fs.writeFileSync(path.join(outRoot, 'index.html'), renderIndex(all));

/* 台帳から外した大学のページが残らないようにする。
   残すと sitemap に載らないページが本番に居座り、check-site も気づけない */
const keep = new Set(all.map(u => u.slug));
for (const e of fs.readdirSync(outRoot, { withFileTypes: true })) {
  if (e.isDirectory() && !keep.has(e.name)) {
    fs.rmSync(path.join(outRoot, e.name), { recursive: true, force: true });
    console.log(`  – /univ/${e.name}/ を削除した（台帳に無い）`);
  }
}

console.log(`  ✓ 大学別ページ: ${all.length} 校 + 一覧`);

saveDates();
