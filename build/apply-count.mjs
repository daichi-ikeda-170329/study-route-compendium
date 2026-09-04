/**
 * 収録冊数の表記を実データへ合わせ、合わせきれない場所を検出する。
 *
 *   node build/apply-count.mjs          書き換える
 *   node build/apply-count.mjs --check  ずれているかだけ見る（書き込まない）
 *
 * 設計は docs/new-books-plan.md の 8 節。**冊数がずれていれば必ず終了コード 1 で
 * 落ちる。** `.github/workflows/counts.yml` が push のたびにこれを流し、直せる分は
 * 自動で直してコミットし、直せない分でジョブを落とす。冊数の更新を忘れられない
 * ようにしているのはこの 2 つ（落ちる --check と CI）であって、手順書ではない。
 *
 * 冊数の表記には 3 種類あり、それぞれ別の方法で面倒を見る。
 *
 *   1. ポータル index.html と README の合計・科目別 … `rules()`
 *      title・meta の content 属性の中に HTML コメントは置けないので、プレース
 *      ホルダを埋め込む方式が採れない。代わりに build/data/count-state.json に
 *      前回書き込んだ値を持ち、それを新値へ置換する。
 *   2. 科目トップと派生統計 … `applySubjectTops()` / `applyAnchors()`
 *      前回値を見ず、前後の文脈ごと拾って書き換える。何度流しても同じ結果になる。
 *      **文脈が 1 件も当たらなければ落とす。** 文面を変えて正規表現が外れると、
 *      数字だけが黙って古いまま凍りつくため。
 *   3. 上のどれでも拾えていない場所 … `sweep()`
 *      生成物を含む全ファイルから「◯◯◯冊」（100 以上）を集め、実データから
 *      出る値でないものを報告する。新しい言い回しで冊数を書いた場所や、
 *      再生成し忘れた生成ページはここに出る。冊数でない数字は
 *      build/data/count-ignore.json に理由付きで登録して黙らせる。
 *
 * 画像に焼き込んだ冊数はここでは扱えない。
 *   assets/x-header.png … SVG が正本にあるので月 1 回焼き直す（README の X アカウント節）
 *   assets/ogp*.png     … build/gen-ogp.mjs が BOOKS から数え直して焼き直す
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSubject, SUBJECTS } from './lib/extract.mjs';
import { tally } from './lib/tally.mjs';
import { searchName, withAuthor } from './lib/booktitle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = path.join(ROOT, 'build', 'data', 'count-state.json');
const AUTHORS_FILE = path.join(ROOT, 'build', 'data', 'authors.json');
const IGNORE_FILE = path.join(ROOT, 'build', 'data', 'count-ignore.json');
const CHECK = process.argv.includes('--check');

const comma = n => n.toLocaleString('en-US');   // 1390 → "1,390"

/**
 * 実データから冊数の正本を作る。ここに出る値だけが「正しい冊数」で、
 * `sweep()` はこの集合に無い数字を報告する。
 */
function truth() {
  const subjects = {};   // dir -> 収録冊数
  const picks = {};      // dir -> おすすめ（ルート本線で採用した本）の冊数。ルートを持たない科目は null
  const unis = {};       // dir -> その科目のルートが対応している大学数
  const uniNames = new Set();   // サイト全体の収録大学（科目をまたいだ和集合）
  let total = 0, covers = 0, nonHensachi = 0, shorthand = 0, withAuthorCount = 0;

  for (const s of SUBJECTS) {
    const d = extractSubject(ROOT, s.dir);
    subjects[s.dir] = d.books.length;
    unis[s.dir] = d.unis.length;
    d.unis.forEach(u => uniNames.add(u.n));
    total += d.books.length;

    if (s.catalogOnly) {
      picks[s.dir] = null;
    } else {
      const main = tally(d.routes, d.tiers).main;
      picks[s.dir] = d.books.filter(b => (main.get(b.id) || 0) > 0).length;
    }

    for (const b of d.books) {
      if (b.cover) covers++;
      // rank.mjs の hensachiRange() と同じ判定。偏差値を数値で書いていない本を数える
      const nums = (String(b.hensachi || '').match(/\d{2}/g) || []).map(Number).filter(n => n >= 25 && n <= 85);
      if (!nums.length) nonHensachi++;
      // booktitle.mjs の判定をそのまま呼ぶ。README の統計を独自に数え直すと実装とずれる
      const sn = searchName(b, s.dir);
      if (sn !== b.name) shorthand++;
      if (withAuthor(b, s.dir) !== sn) withAuthorCount++;
    }
  }

  const authors = Object.keys(JSON.parse(fs.readFileSync(AUTHORS_FILE, 'utf8')).authors).length;
  return {
    total, subjects, picks, unis, uniTotal: uniNames.size,
    covers, nonHensachi, shorthand, withAuthor: withAuthorCount,
    authors, authorless: total - authors,
  };
}

/**
 * 置換の指示を組み立てる（ポータル index.html と README の合計・科目別）。
 *
 * 合計冊数だけは index.html / README のどちらでも全置換してよい。現在この 2 つの
 * ファイルに現れる 4 桁の同値は、数えたところ全部が冊数だからである。
 * **科目別の冊数（3 桁）は全置換できない。** CSS の値や座標に同じ数字が出るため、
 * 必ず前後の文脈ごと指定する。
 */
function rules(oldS, newS) {
  const { total: oT, subjects: oSub } = oldS;
  const { total: nT, subjects: nSub } = newS;
  const out = [];

  const push = (file, from, to) => { if (from !== to) out.push({ file, from, to }); };

  // 合計（カンマ有り・無しの両形）
  for (const f of ['index.html', 'README.md']) {
    push(f, comma(oT), comma(nT));
    push(f, String(oT), String(nT));
  }

  for (const s of SUBJECTS) {
    const o = oSub[s.dir], n = nSub[s.dir];
    if (o === undefined || n === undefined) continue;
    // ポータルの科目カード「<b>◯◯◯</b>冊収録」
    push('index.html', `<b>${comma(o)}</b>冊収録`, `<b>${comma(n)}</b>冊収録`);
    // ポータルの図鑑リンク「◯◯◯冊 — 単語・文法…」
    push('index.html', `<small>${o}冊 — `, `<small>${n}冊 — `);
    // README の収録数テーブル「| 英語 | `english/` | ◯◯◯ |」
    push('README.md', `| ${s.ja} | \`${s.dir}/\` | ${o} |`, `| ${s.ja} | \`${s.dir}/\` | ${n} |`);
  }
  return out;
}

/**
 * 文脈ごと拾って書き換える冊数（前回値を見ないので何度流しても同じ結果になる）。
 *
 * `re` は 3 つの捕獲群を持つ ── 前・数字・後。数字だけを差し替える。`hits` は
 * 「ちょうどこの件数だけ当たるはず」という数で、外れたら `applyAnchors()` が落とす。
 * **文面を変えるときはここも一緒に直す。** 当たらなくなったことを検出できないと、
 * 数字だけが黙って古いまま凍りつく。件数まで見るのは、同じ言い回しが README の
 * 別の統計にも出るため（「現在 ◯◯ 冊が該当する」は cover と内部略称の 2 か所にある）。
 */
function anchors(t) {
  return [
    { file: 'README.md', why: 'cover を直接持つ本の数',
      re: /(最優先で参照する。現在 )([\d,]+)( 冊が該当する)/g, value: t.covers },
    { file: 'README.md', why: '内部略称とみなした本の数',
      re: /(整えて使う。現在 )([\d,]+)( 冊が該当する)/g, value: t.shorthand },
    { file: 'README.md', why: 'authors.json に著者名がある本の数',
      re: /(人名を取得する。)([\d,]+)( 冊分ある)/g, value: t.authors },
    { file: 'README.md', why: 'authors.json に著者名がある本の数（構成表）',
      re: /(実在確認済み )([\d,]+)( 冊分）)/g, value: t.authors },
    { file: 'README.md', why: '著者名が判明しない本の数（収録 − authors.json）',
      re: /(判明しない )([\d,]+)( 冊)/g, value: t.authorless },
    { file: 'README.md', why: 'title と h1 を著者名込みにする本の数',
      re: /(。)([\d,]+)( 冊が該当する。書名にすでに)/g, value: t.withAuthor },
    { file: 'build/lib/rank.mjs', why: '収録冊数',
      re: /(収録 )([\d,]+)( 冊のうち)/g, value: t.total },
    { file: 'build/lib/rank.mjs', why: '偏差値を数値で書いていない本の数',
      re: /(冊のうち )([\d,]+)( 冊がこの書き方)/g, value: t.nonHensachi },
    // ポータルのヒーロー統計。全科目を合わせた収録大学数（科目ごとの数とは別）
    { file: 'index.html', why: '収録大学（全科目の和集合）',
      re: /(<div class="stat"><b>)([\d,]+)(<\/b><span>収録大学（全科目）<\/span><\/div>)/g, value: t.uniTotal },
  ];
}

/** 文脈アンカーを当てる。{hits, missing} を返す */
function applyAnchors(t, write) {
  let hits = 0;
  const missing = [];
  const byFile = new Map();

  for (const a of anchors(t)) {
    if (!byFile.has(a.file)) byFile.set(a.file, fs.readFileSync(path.join(ROOT, a.file), 'utf8'));
    let found = 0;
    const out = byFile.get(a.file).replace(a.re, (m, pre, old, post) => {
      found++;
      if (old !== comma(a.value)) { hits++; console.log(`  ${a.file}: ${a.why} ${old} → ${comma(a.value)}`); }
      return `${pre}${comma(a.value)}${post}`;
    });
    const want = a.hits ?? 1;
    if (found !== want) missing.push(`${a.file}: ${a.why}（${a.re}）が ${found} 件当たった（${want} 件のはず）`);
    byFile.set(a.file, out);
  }

  if (write) {
    for (const [file, src] of byFile) {
      const p = path.join(ROOT, file);
      if (fs.readFileSync(p, 'utf8') !== src) fs.writeFileSync(p, src, 'utf8');
    }
  }
  return { hits, missing };
}

/**
 * 科目トップ（<科目>/index.html）の冊数を、前回値に頼らず文脈で置き換える。
 *
 * ポータルと README は count-state.json の前回値を手掛かりにできるが、科目トップは
 * title・meta・og・twitter・JSON-LD・本文の 9〜11 箇所に同じ数字が散っていて、
 * しかも state と実数が一致していると `main()` が早期に戻るため、これまで
 * 一度も更新されていなかった（2026-09 時点で 5 科目が古い冊数のまま残っていた）。
 *
 * `min` は「最低これだけ当たるはず」の件数。当たらなければ文面を変えて正規表現が
 * 外れたということなので、`applySubjectTops()` が落とす。
 */
function subjectTopRules(total, picks, unis) {
  const rules = [
    // 「英語参考書252冊」「英語の参考書252冊」「英語の参考書一覧 252冊」
    { re: /(参考書(?:一覧)?[ 　]?)(\d+)冊/g, value: total, min: 1, why: '収録冊数' },
    // 科目トップの本文リード「定番から最新刊まで162冊を…」（数学だけが持つ）
    { re: /(最新刊まで)(\d+)冊/g, value: total, min: 0, why: '収録冊数（リード）' },
    // ヒーローの統計カード。JS が起動後に上書きするが、クローラーと JS 無効の
    // 環境が見るのは HTML に書かれたこの値。2026-09 時点で 5 科目が古い数字のまま
    // 凍っていた（英語 172・国語 152・数学 113・理科 346・社会 250）
    { re: /(<b id="stat-books">)(\d+)(?=<\/b>)/g, value: total, min: 1, why: 'ヒーローの収録参考書' },
    { re: /(<b id="stat-unis">)(\d+)(?=<\/b>)/g, value: unis, min: 0, why: 'ヒーローの収録大学' },
  ];
  // ルートを持たない科目（情報・小論文）はおすすめページ自体が無い
  if (picks !== null) {
    rules.push({ re: /(参考書おすすめ[ 　]?)(\d+)冊/g, value: picks, min: 1, why: 'おすすめ冊数' });
  }
  return rules;
}


/**
 * フッターの科目別冊数「◯◯ルート大全 / n BOOKS」を、科目 ID と表示値の組で検査する。
 *
 * sweep() は「実データに存在する数字か」しか見ないので、**別の科目の正しい冊数を
 * 別の科目の欄に書いてしまった誤りを素通りさせる**。2026-09 に理科の欄だけが
 * 375 のまま 5 ファイルに残っていたのがこれ（375 は当時どこかで有効だった値）。
 * ここでは科目名と数字を組で拾い、その科目の実数と突き合わせる。
 *
 * 生成ページのフッターは build/lib/parts.mjs の footer() が唯一の生成元なので、
 * ずれるのは手書きの 8 枚だけのはずだが、生成し忘れも同じ形で出るので全 HTML を見る。
 */
function applyFooterBooks(t, write) {
  const byJa = new Map(SUBJECTS.map(s => [s.ja, t.subjects[s.dir]]));
  const re = /(<b>([^<]*?)ルート大全<\/b><span>)([\d,]+)( BOOKS<\/span>)/g;
  const missing = [];
  let hits = 0, files = 0, seen = 0;

  for (const file of sweepFiles()) {
    if (!/\.html$/.test(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    let bad = 0;
    const out = src.replace(re, (m, pre, ja, num, post) => {
      seen++;
      const want = byJa.get(ja);
      if (want === undefined) {
        missing.push(`${path.relative(ROOT, file)}: フッターに未知の科目「${ja}」がある`);
        return m;
      }
      if (String(want) === num.replace(/,/g, '')) return m;
      bad++; hits++;
      return `${pre}${want}${post}`;
    });
    if (bad) {
      files++;
      console.log(`  ${path.relative(ROOT, file)}: フッターの科目別冊数を ${bad} 件そろえた`);
      if (write) fs.writeFileSync(file, out, 'utf8');
    }
  }
  // フッターは全公開 HTML にあるので、1 件も見つからなければ構造が変わっている
  if (seen < SUBJECTS.length) missing.push(`フッターの科目別冊数が ${seen} 件しか見つからない（構造を変えたなら正規表現も直す）`);
  if (hits) console.log(`フッターの科目別冊数を ${hits} 箇所そろえた（${files} ファイル）`);
  return { hits, missing };
}

/** 科目トップの冊数を書き換える。{hits, missing} を返す */
function applySubjectTops(t, write) {
  let hits = 0;
  const missing = [];

  for (const s of SUBJECTS) {
    const total = t.subjects[s.dir];
    const picks = t.picks[s.dir];
    const file = path.join(ROOT, s.dir, 'index.html');
    const src = fs.readFileSync(file, 'utf8');
    let out = src;

    for (const r of subjectTopRules(total, picks, t.unis[s.dir])) {
      let found = 0;
      out = out.replace(r.re, (m, pre, old) => {
        found++;
        if (String(r.value) !== old) hits++;
        // 「◯◯冊」の形と、タグの中の数字だけの形の両方がある
        return r.re.source.includes('冊') ? `${pre}${r.value}冊` : `${pre}${r.value}`;
      });
      if (found < r.min) missing.push(`${s.dir}/index.html: ${r.why}（${r.re}）が ${found} 件しか当たらない`);
    }

    if (out !== src) {
      console.log(`  ${s.dir}/index.html: 冊数を書き換えた（全 ${total} 冊${picks === null ? '' : ` / おすすめ ${picks} 冊`}）`);
      if (write) fs.writeFileSync(file, out, 'utf8');
    }
  }
  return { hits, missing };
}

// changelog/ は git のコミットメッセージをそのまま並べたページ。当時の冊数が
// 出てくるのは正しい記録なので、実データと照合しない
const SWEEP_SKIP_DIRS = new Set(['.git', 'node_modules', 'docs', 'changelog',
  // dist/ は公開用の写し。ここを直しても元が古いままなので、元だけを見る
  'dist', 'test-results', 'playwright-report']);
const SWEEP_EXT = /\.(html|js|mjs|md)$/;

/** 走査対象のファイルを集める。docs/ は当時の記録なので数字を凍らせたままでよい */
function sweepFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SWEEP_SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sweepFiles(p, out);
    else if (SWEEP_EXT.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * 実データから出ない「◯◯◯冊」を全ファイルから拾う。
 *
 * 100 未満は数えない。参考書の紹介文に「3 部作の 2 冊目」「アクセス 3 冊で」の
 * ような書き方が大量にあり、区別が付かないため。おすすめ冊数が 2 桁の科目
 * （国語 89 冊）は `applySubjectTops()` が毎回そろえるので取りこぼしにならない。
 */
function sweep(t) {
  const ok = new Set([
    t.total, t.covers, t.authors, t.authorless,
    t.nonHensachi, t.shorthand, t.withAuthor,
  ]);
  for (const s of SUBJECTS) {
    ok.add(t.subjects[s.dir]);
    if (t.picks[s.dir] !== null) {
      ok.add(t.picks[s.dir]);
      ok.add(t.subjects[s.dir] - t.picks[s.dir]);   // おすすめページの「残りの◯◯◯冊」
    }
  }

  const ignore = JSON.parse(fs.readFileSync(IGNORE_FILE, 'utf8')).ignore;
  const ignored = (file, value) => ignore.some(g => g.file === file && g.value === value);

  const found = [];
  for (const abs of sweepFiles()) {
    const rel = path.relative(ROOT, abs);
    fs.readFileSync(abs, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/([0-9][0-9,，]*)[ 　]?冊/g)) {
        const n = Number(m[1].replace(/[,，]/g, ''));
        if (n < 100 || ok.has(n) || ignored(rel, n)) continue;
        const at = m.index;
        found.push({ file: rel, line: i + 1, value: n, ctx: line.slice(Math.max(0, at - 40), at + 20).replace(/\s+/g, ' ').trim() });
      }
    });
  }
  return found;
}

function main() {
  const t = truth();
  const old = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const next = { total: t.total, subjects: t.subjects };

  // 文脈で当てる分は前回値を見ずに毎回そろえる（state と実数が一致していても、
  // 科目トップ側だけがずれていることがあるため。下の早期 return より前に置く）
  const tops = applySubjectTops(t, !CHECK);
  const anch = applyAnchors(t, !CHECK);
  const foot = applyFooterBooks(t, !CHECK);
  const missing = [...tops.missing, ...anch.missing, ...foot.missing];
  const ctxHits = tops.hits + anch.hits + foot.hits;

  const same = old.total === t.total && SUBJECTS.every(s => old.subjects[s.dir] === t.subjects[s.dir]);
  let hits = 0;

  if (same) {
    console.log(`ポータルと README の冊数は一致している（合計 ${comma(t.total)} 冊）`);
    if (ctxHits) console.log(`文脈で当てる冊数を ${ctxHits} 箇所そろえた${CHECK ? '（--check なので書き込んでいない）' : ''}`);
  } else {
    console.log(`合計 ${comma(old.total)} → ${comma(t.total)} 冊`);
    for (const s of SUBJECTS) {
      if (old.subjects[s.dir] !== t.subjects[s.dir]) {
        console.log(`  ${s.ja}: ${old.subjects[s.dir]} → ${t.subjects[s.dir]}`);
      }
    }

    const byFile = new Map();
    for (const { file, from, to } of rules(old, next)) {
      if (!byFile.has(file)) byFile.set(file, fs.readFileSync(path.join(ROOT, file), 'utf8'));
      const src = byFile.get(file);
      const n = src.split(from).length - 1;
      if (!n) continue;
      hits += n;
      byFile.set(file, src.split(from).join(to));
      console.log(`  ${file}: 「${from.length > 34 ? `${from.slice(0, 34)}…` : from}」 ${n} 件`);
    }

    if (!hits) {
      console.error('置換が 1 件も無い。count-state.json と実ファイルが食い違っている（手で直したか、表記を変えたか）。');
      console.error('README と index.html の冊数表記を確かめ、count-state.json を現状に合わせてから流し直す。');
      process.exit(1);
    }

    if (!CHECK) {
      for (const [file, src] of byFile) fs.writeFileSync(path.join(ROOT, file), src, 'utf8');
      fs.writeFileSync(STATE_FILE, `${JSON.stringify({
        note: old.note, note2: old.note2, ...next,
      }, null, 2)}\n`, 'utf8');
      console.log(`置換 ${hits} 件。count-state.json を更新した`);
      console.log('画像に焼き込んだ冊数は別手順。OGP は node build/gen-ogp.mjs、X のヘッダーは README の X アカウント節を見る');
    }
  }

  // 文脈が外れていないかを先に報告する。ここが崩れると以後の自動追従が止まる
  for (const m of missing) console.error(`文脈が当たらない: ${m}`);

  // 書き込んだあとに走らせる。ここに残るのは自動で直せなかった場所だけ
  const stray = sweep(t);
  for (const s of stray) {
    console.error(`実データに無い冊数: ${s.file}:${s.line} [${comma(s.value)}冊] …${s.ctx}…`);
  }
  if (stray.length) {
    console.error(`冊数でない数字なら build/data/count-ignore.json に理由付きで登録する（${stray.length} 件）`);
  }

  const dirty = CHECK && (hits > 0 || ctxHits > 0);
  if (dirty) console.error(`冊数がずれている（置換 ${hits} 件・文脈 ${ctxHits} 箇所）。node build/apply-count.mjs で直す`);
  if (dirty || missing.length || stray.length) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
