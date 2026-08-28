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

function main() {
  const old = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

  const subjects = {};
  let total = 0;
  for (const s of SUBJECTS) {
    const n = extractSubject(ROOT, s.dir).books.length;
    subjects[s.dir] = n;
    total += n;
  }
  const next = { total, subjects };

  const same = old.total === total && SUBJECTS.every(s => old.subjects[s.dir] === subjects[s.dir]);
  if (same) {
    console.log(`冊数は一致している（合計 ${comma(total)} 冊）。書き換えるものは無い`);
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
    console.log(`置換 ${hits} 件（--check なので書き込んでいない）`);
    return;
  }
  for (const [file, src] of byFile) fs.writeFileSync(path.join(ROOT, file), src, 'utf8');
  fs.writeFileSync(STATE_FILE, `${JSON.stringify({
    note: old.note, note2: old.note2, ...next,
  }, null, 2)}\n`, 'utf8');
  console.log(`置換 ${hits} 件。count-state.json を更新した`);
  console.log('画像に焼き込んだ冊数（assets/x-header.png・assets/ogp*.png）は別手順。docs/new-books-plan.md の 8 節を見る');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
