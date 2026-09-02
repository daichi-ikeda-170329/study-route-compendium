/**
 * 収録冊数の表記を実データへ合わせる。
 *
 *   node build/apply-count.mjs          書き換える
 *   node build/apply-count.mjs --check  ずれているかだけ見る（書き込まない）
 *
 * 設計は docs/new-books-plan.md の 8 節。
 *
 * ポータル index.html は 13 箇所（title・meta description・og・twitter・JSON-LD・
 * 本文・統計カード）に合計冊数を持ち、科目カードには科目別の冊数を持つ。
 * README の収録数テーブルにも両方がある。参考書を 1 冊足すたび、ここが全部ずれる。
 *
 * **title や meta の content 属性の中に HTML コメントは置けない**ので、
 * プレースホルダを埋め込む方式が採れない。代わりに build/data/count-state.json に
 * 前回書き込んだ値を持ち、それを新値へ置換する。
 *
 * **置換が 1 件も無ければ終了コード 1 で止める。** 黙って何もしないと、冊数だけが
 * 古いまま残り、しかも次回は state と実数が食い違ったまま固定される。
 *
 * 画像に焼き込んだ冊数はここでは扱えない。
 *   assets/x-header.png … SVG が正本にあるので月 1 回焼き直す（README の X アカウント節）
 *   assets/ogp*.png     … 元の SVG も生成手順もリポジトリに無い。当面は据え置く
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSubject, SUBJECTS } from './lib/extract.mjs';
import { tally } from './lib/tally.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = path.join(ROOT, 'build', 'data', 'count-state.json');
const CHECK = process.argv.includes('--check');

const comma = n => n.toLocaleString('en-US');   // 1052 → "1,052"

/**
 * 置換の指示を組み立てる。
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
    // ポータルの科目カード「<b>173</b>冊収録」
    push('index.html', `<b>${comma(o)}</b>冊収録`, `<b>${comma(n)}</b>冊収録`);
    // ポータルの図鑑リンク「173冊 — 単語・文法…」
    push('index.html', `<small>${o}冊 — `, `<small>${n}冊 — `);
    // README の収録数テーブル「| 英語 | `english/` | 173 |」
    push('README.md', `| ${s.ja} | \`${s.dir}/\` | ${o} |`, `| ${s.ja} | \`${s.dir}/\` | ${n} |`);
  }
  return out;
}

/**
 * 科目トップ（<科目>/index.html）の冊数を、前回値に頼らず文脈で置き換える。
 *
 * ポータルと README は count-state.json の前回値を手掛かりにできるが、科目トップは
 * title・meta・og・twitter・JSON-LD・本文の 9〜11 箇所に同じ数字が散っていて、
 * しかも state と実数が一致していると `main()` が早期に戻るため、これまで
 * 一度も更新されていなかった（2026-09 時点で 5 科目が古い冊数のまま残っていた）。
 *
 * ここでは「参考書」「参考書一覧」「最新刊まで」「参考書おすすめ」という前後の
 * 文脈ごと拾って書き換える。前回値を見ないので、何度流しても同じ結果になる。
 * 文面を書き換えるときはこの正規表現も一緒に直す。
 */
function subjectTopRules(dir, total, picks) {
  const rules = [
    // 「英語参考書252冊」「英語の参考書252冊」「英語の参考書一覧 252冊」
    [/(参考書(?:一覧)?[ 　]?)(\d+)冊/g, total],
    // 科目トップの本文リード「定番から最新刊まで162冊を…」
    [/(最新刊まで)(\d+)冊/g, total],
  ];
  // ルートを持たない科目（情報・小論文）はおすすめページ自体が無い
  if (picks !== null) rules.push([/(参考書おすすめ[ 　]?)(\d+)冊/g, picks]);
  return rules;
}

/** 科目トップの冊数を書き換える。書き換えた箇所数を返す */
function applySubjectTops(data, write) {
  let hits = 0;
  for (const s of SUBJECTS) {
    const d = data[s.dir];
    const total = d.books.length;
    const picks = s.catalogOnly ? null
      : d.books.filter(b => (tally(d.routes, d.tiers).main.get(b.id) || 0) > 0).length;
    const file = path.join(ROOT, s.dir, 'index.html');
    const src = fs.readFileSync(file, 'utf8');
    let out = src;
    for (const [re, n] of subjectTopRules(s.dir, total, picks)) {
      out = out.replace(re, (m, pre, old) => {
        if (String(n) !== old) hits++;
        return `${pre}${n}冊`;
      });
    }
    if (out !== src) {
      console.log(`  ${s.dir}/index.html: 冊数を書き換えた（全 ${total} 冊${picks === null ? '' : ` / おすすめ ${picks} 冊`}）`);
      if (write) fs.writeFileSync(file, out, 'utf8');
    }
  }
  return hits;
}

function main() {
  const old = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

  const data = {};
  const subjects = {};
  let total = 0;
  for (const s of SUBJECTS) {
    data[s.dir] = extractSubject(ROOT, s.dir);
    subjects[s.dir] = data[s.dir].books.length;
    total += subjects[s.dir];
  }
  const next = { total, subjects };

  // 科目トップは前回値を見ずに毎回そろえる（state と実数が一致していても、
  // 科目トップ側だけがずれていることがあるため。下の早期 return より前に置く）
  const topHits = applySubjectTops(data, !CHECK);

  const same = old.total === total && SUBJECTS.every(s => old.subjects[s.dir] === subjects[s.dir]);
  if (same) {
    console.log(`ポータルと README の冊数は一致している（合計 ${comma(total)} 冊）`);
    if (topHits) console.log(`科目トップの冊数を ${topHits} 箇所そろえた${CHECK ? '（--check なので書き込んでいない）' : ''}`);
    return;
  }

  console.log(`合計 ${comma(old.total)} → ${comma(total)} 冊`);
  for (const s of SUBJECTS) {
    if (old.subjects[s.dir] !== subjects[s.dir]) {
      console.log(`  ${s.ja}: ${old.subjects[s.dir]} → ${subjects[s.dir]}`);
    }
  }

  const byFile = new Map();
  let hits = 0;
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

  if (CHECK) {
    console.log(`置換 ${hits} 件＋科目トップ ${topHits} 箇所（--check なので書き込んでいない）`);
    return;
  }
  for (const [file, src] of byFile) fs.writeFileSync(path.join(ROOT, file), src, 'utf8');
  fs.writeFileSync(STATE_FILE, `${JSON.stringify({
    note: old.note, note2: old.note2, ...next,
  }, null, 2)}\n`, 'utf8');
  console.log(`置換 ${hits} 件（科目トップ ${topHits} 箇所を含む）。count-state.json を更新した`);
  console.log('画像に焼き込んだ冊数（assets/x-header.png・assets/ogp*.png）は別手順。docs/new-books-plan.md の 8 節を見る');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
