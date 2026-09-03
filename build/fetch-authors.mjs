/**
 * 著者名を openBD と国立国会図書館サーチから取り直し、build/data/authors.json を作る。
 *
 *   node build/fetch-authors.mjs           取得して書き込む
 *   node build/fetch-authors.mjs --dry     取得するが書き込まない
 *   node build/fetch-authors.mjs --no-ndl  openBD だけで済ませる（NDL は 1 冊 1 リクエストで遅い）
 *
 * **推測で著者名を補わない。** 書誌データベースが返した人名だけを載せる。
 * 出版社名・団体名（編集部・◯◯会・◯◯社 など）は著者として扱わない。
 *
 * 書誌データベースの人名は「姓, 名, 生年-」の形で返る（例「西, きょうじ, 1963-」）。
 * これをカンマで割って 2 文字未満の断片を捨てると、姓 1 文字の著者が姓ごと消えて
 * 「きょうじ」になる。2026-08 の authors.json はこの壊れ方をしていた。
 * ここでは姓と名を連結して 1 人分の名前に戻し、生没年は落とす。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSubject, SUBJECTS } from './lib/extract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'build', 'data', 'authors.json');
const DRY = process.argv.includes('--dry');
const NO_NDL = process.argv.includes('--no-ndl');

/** 団体・組織を表す語。人名としては採らない */
const ORG = /(編集部|編集委員会|委員会|研究所|研究会|予備校|ゼミ|学園|学校|会社|出版|書店|書房|新社|社編|教育社|Ｚ会|Z会|ベネッセ|旺文社|教学社|河合塾|駿台|東進|鉄緑会|学研|数研|旺文|協会|機構|学会|大学$|事務局)/;

/** 生没年（1963- / 1966-2020 / 1953?-） */
const YEARS = /^\d{3,4}\??\s*-\s*\d{0,4}$/;

const hasLatin = s => /[A-Za-z]/.test(s);

/**
 * 書誌データベースの人名表記を 1 人分の名前へ直す。
 * 「姓, 名, 生年-」→「姓名」／「姓 名」→「姓名」／欧文は空白を残す。
 * 人名として採れないものは null を返す。
 */
export function normalizePerson(raw) {
  const s = String(raw || '').replace(/[\s　]+/g, ' ').trim();
  if (!s) return null;
  const parts = s.split(',').map(p => p.trim()).filter(p => p && !YEARS.test(p));
  if (!parts.length) return null;
  const name = parts.length === 1
    ? parts[0]
    : (hasLatin(parts[0]) || hasLatin(parts[1]) ? parts.join(' ') : parts.join(''));
  const clean = name.replace(/[\s　]+/g, hasLatin(name) ? ' ' : '').trim();
  if (!clean || clean === 'ほか' || clean === '他') return null;
  if (ORG.test(clean)) return null;
  // 1 文字の「名前」は姓か名の断片。壊れたデータを増やさないために捨てる
  if ([...clean].length < 2) return null;
  return clean;
}

/** openBD の 1 レコードから著者名の配列を作る */
export function authorsFromOpenBd(rec) {
  const onix = rec?.onix?.DescriptiveDetail?.Contributor || [];
  const fromOnix = onix
    .map(c => normalizePerson(c?.PersonName?.content))
    .filter(Boolean);
  if (fromOnix.length) return [...new Set(fromOnix)];
  // ONIX に Contributor が無い本は summary.author を割る。
  // 「篠田,重晃 玉置,全人」のように 1 人分がカンマ、人と人が空白で区切られる
  const sum = String(rec?.summary?.author || '').replace(/／.*$/, '').trim();
  if (!sum) return [];
  return [...new Set(sum.split(/[ 　]+/).map(normalizePerson).filter(Boolean))];
}

/** 国立国会図書館サーチの dc:creator（「姓, 名」形式）から著者名を拾う */
export function authorsFromNdl(xml) {
  return [...new Set(
    [...String(xml).matchAll(/<dc:creator>([^<]*)<\/dc:creator>/g)]
      .map(m => normalizePerson(m[1].replace(/\s*(著|編|編著|監修|共著)$/, '')))
      .filter(Boolean)
  )];
}

async function main() {
  const books = [];
  for (const s of SUBJECTS) {
    for (const b of extractSubject(ROOT, s.dir).books) {
      if (b.isbn13) books.push({ key: `${s.dir}/${b.id}`, isbn: String(b.isbn13) });
    }
  }
  console.log(`ISBN を持つ本: ${books.length} 冊`);

  const authors = {};
  const source = {};

  // --- openBD（50 冊ずつまとめて 1 リクエスト） ---
  let openbdHit = 0;
  for (let i = 0; i < books.length; i += 50) {
    const chunk = books.slice(i, i + 50);
    const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${chunk.map(c => c.isbn).join(',')}`);
    if (!res.ok) throw new Error(`openBD が ${res.status} を返した`);
    const json = await res.json();
    chunk.forEach((c, k) => {
      const names = authorsFromOpenBd(json[k]);
      if (names.length) { authors[c.key] = names; source[c.key] = 'openBD'; openbdHit++; }
    });
    process.stdout.write(`\r  openBD: ${Math.min(i + 50, books.length)} / ${books.length}`);
  }
  console.log(`\n  openBD で著者が判明: ${openbdHit} 冊`);

  // --- NDL（openBD で取れなかった本だけ。1 冊 1 リクエストなので最後に回す） ---
  // タイムアウトを必ず付ける。fetch は既定で待ち続けるので、1 冊詰まると全体が止まる。
  let ndlHit = 0;
  if (!NO_NDL) {
    const rest = books.filter(b => !authors[b.key]);
    let done = 0;
    const worker = async queue => {
      for (const b of queue) {
        try {
          const res = await fetch(`https://ndlsearch.ndl.go.jp/api/opensearch?isbn=${b.isbn}`,
            { signal: AbortSignal.timeout(12000) });
          if (res.ok) {
            const names = authorsFromNdl(await res.text());
            if (names.length) { authors[b.key] = names; source[b.key] = 'NDL'; ndlHit++; }
          }
        } catch {
          // 1 冊取れなくても全体は続ける。取れなかった本は著者欄を出さないだけ
        }
        if (++done % 25 === 0) process.stdout.write(`\r  NDL: ${done} / ${rest.length}`);
      }
    };
    const lanes = 4;
    await Promise.all(Array.from({ length: lanes }, (_, i) =>
      worker(rest.filter((_, k) => k % lanes === i))));
    console.log(`\r  NDL で著者が判明: ${ndlHit} 冊（${rest.length} 冊に照会）`);
  }

  // --- 前回の結果のうち、今回も実在を確認できた人名だけを残す ---
  // openBD はときどき同じ ISBN に null を返す。取り直すたびに著者欄が消えたり
  // 出たりしないよう、前回の authors.json にあった名前のうち「今回どれかの本で
  // API が返した人名と完全一致するもの」だけを引き継ぐ。名前を新しく作らない。
  let carried = 0;
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8')).authors || {};
    const known = new Set(Object.values(authors).flat());
    for (const [key, names] of Object.entries(prev)) {
      if (authors[key]) continue;
      const kept = names.filter(n => known.has(n));
      if (kept.length) { authors[key] = kept; source[key] = '前回の結果を引き継ぎ'; carried++; }
    }
  } catch {
    // 初回は前回の結果が無い。引き継ぐものが無いだけで、処理は続く
  }
  console.log(`  前回の結果から引き継ぎ: ${carried} 冊`);

  // --- 正式名称に現れる著者名（書誌データベースが著者を持たない本の補完） ---
  // 新しく名前を作らない。上の 2 つの API が実在を確認した人名が official に
  // そのまま出てくる本にだけ付ける（「関正生の英文法ポラリス1」など）。
  const verified = [...new Set(Object.values(authors).flat())].filter(n => [...n].length >= 3);
  let inferred = 0;
  for (const s of SUBJECTS) {
    for (const b of extractSubject(ROOT, s.dir).books) {
      const key = `${s.dir}/${b.id}`;
      if (authors[key]) continue;
      const hay = `${b.official || ''} ${b.name || ''}`;
      const hit = verified.filter(n => hay.includes(n));
      if (hit.length && hit.length <= 3) { authors[key] = hit; source[key] = 'official'; inferred++; }
    }
  }
  console.log(`  正式名称から補完: ${inferred} 冊`);

  const sorted = Object.fromEntries(Object.keys(authors).sort().map(k => [k, authors[k]]));
  const out = {
    _provenance: {
      source: 'openBD API (https://api.openbd.jp/v1/get) の ONIX DescriptiveDetail.Contributor.PersonName と summary.author、'
        + 'および国立国会図書館サーチ OpenSearch (https://ndlsearch.ndl.go.jp/api/opensearch) の dc:creator',
      fetched: new Date().toISOString().slice(0, 10),
      method: 'build/fetch-authors.mjs が各書の isbn13 で照会する。書誌データベースの「姓, 名, 生年-」表記は姓と名を連結して 1 人分に戻し、生没年は落とす。'
        + '出版社名・団体名（編集部・◯◯会・◯◯社 など）は著者として採らない。'
        + '前回の結果にあった名前は、今回どこかの本で API が返した人名と完全一致する場合にかぎり引き継ぐ（openBD が同じ ISBN に null を返すことがあるため）。'
        + 'どちらの API にも著者記載が無い本は、API が実在を確認した人名が正式名称に現れる場合にかぎり、その人名を付ける。',
      policy: '推測で著者名を補わない。判明しない本は未収録のままにする（生成側は著者欄を出さない）。',
      coverage: `${Object.keys(sorted).length} / ${books.length} 冊`,
    },
    authors: sorted,
  };

  if (DRY) {
    console.log(`--dry なので書き込まない（${Object.keys(sorted).length} 冊分）`);
    return;
  }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`, 'utf8');
  console.log(`build/data/authors.json を書き換えた（${Object.keys(sorted).length} 冊分）`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
