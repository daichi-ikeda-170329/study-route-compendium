/**
 * サイト全体の回帰検査。**データと、生成済みの出力 HTML の両方**を見る。
 *
 *   node build/check-site.mjs            全部流す
 *   node build/check-site.mjs --warn-ok  警告があっても終了コード 0 で返す
 *
 * ずれていれば**終了コード 1 で落ちる**。`.github/workflows/test.yml` が push の
 * たびにこれを流す。手順書ではなく、この検査が「同じ壊れ方を二度させない」担保。
 *
 * 冊数の整合は build/apply-count.mjs が受け持つ（あちらは直せる分を直す）。
 * ここは「直せないもの・直すと文章になるもの」を検出して止めるだけにする。
 *
 * 検査は 3 段階に分かれる。
 *
 *   ERROR … 落とす。事実が間違っている・リンクが切れている・規約の必須表記が無い
 *   WARN  … 落とさない。書き換えの候補（誇張語など）。--warn-ok で無視できる
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSubject, SUBJECTS, ORIGIN } from './lib/extract.mjs';
import { LEGAL_PAGES, amazonDisclosure } from './lib/parts.mjs';
import { STAGE_FLOW } from './lib/flow.mjs';
import { seriesOf, hensachiPlain } from './lib/series.mjs';
import { isProvisional } from './lib/newbooks.mjs';
import { BANNED_WORDS, BANNED_PHRASES, BANNED_ALLOW } from './lib/words.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WARN_OK = process.argv.includes('--warn-ok');

const errors = [];
const warns = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warns.push(`${where}: ${msg}`);

/* ============================================================
   走査対象
   ============================================================ */

const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs', 'build', 'test', 'data']);

function htmlFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const rel = p => path.relative(ROOT, p);

/** 属性値に入っている実体参照を戻す。文字数を数えるときに使う */
const unescapeHtml = s => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

/* ============================================================
   1. データ検査
   ============================================================ */

/** ISBN-13 のチェックディジット */
function isbn13Valid(s) {
  const d = String(s).replace(/[^0-9]/g, '');
  if (d.length !== 13) return false;
  const sum = [...d.slice(0, 12)].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(d[12]);
}

/** 説明文のキーワードと役割が食い違う候補を出すための対応表 */
const STAGE_KEYWORDS = {
  english: {
    tango: ['単語', '語彙', 'ワード'],
    jukugo: ['熟語', 'イディオム', '語法', '会話', '発音'],
    bunpo: ['文法', '語法'],
    kaishaku: ['解釈', '構文', '精読', '和訳'],
    chobun: ['長文', '読解', 'リーディング'],
    eisaku: ['英作文', '和文英訳', '自由英作'],
    listening: ['リスニング', '音声', 'ディクテ'],
  },
};

const data = {};
for (const s of SUBJECTS) data[s.dir] = extractSubject(ROOT, s.dir);

function checkData() {
  const required = ['id', 'name', 'pub', 'stage', 'subjects'];
  for (const s of SUBJECTS) {
    const d = data[s.dir];
    const ids = new Set(d.books.map(b => b.id));
    const stageKeys = Object.keys(d.stages);

    // 役割の接続表に、この科目の全 stage が載っていること
    const flow = STAGE_FLOW[s.dir];
    if (!flow) err('flow.mjs', `${s.dir} の接続表が無い`);
    else {
      for (const k of stageKeys) {
        if (!(k in flow)) err('flow.mjs', `${s.dir}: 役割 "${k}" が接続表に無い`);
      }
      for (const [k, nexts] of Object.entries(flow)) {
        if (!stageKeys.includes(k)) err('flow.mjs', `${s.dir}: 接続表の "${k}" は STAGES に無い`);
        for (const n of nexts) {
          if (!stageKeys.includes(n)) err('flow.mjs', `${s.dir}: 接続先 "${n}" は STAGES に無い`);
        }
      }
    }

    for (const b of d.books) {
      const at = `${s.dir}/${b.id}`;
      for (const f of required) {
        if (!b[f]) err(at, `必須フィールド ${f} が無い`);
      }
      if (!stageKeys.includes(b.stage)) err(at, `stage "${b.stage}" が STAGES に無い`);
      if (b.isbn13 && !isbn13Valid(b.isbn13)) err(at, `ISBN-13 のチェックディジットが合わない（${b.isbn13}）`);

      // 難易度。シリーズは範囲の代表値なので整数の範囲だけ見る（評価未了の新刊は除く）
      if (!isProvisional(b)) {
        if (!Number.isInteger(b.diff) || b.diff < 1 || b.diff > 10) {
          err(at, `難易度が 1〜10 の整数でない（${b.diff}）`);
        }
        if (!b.hensachi) err(at, '到達目安が無い');
        if (!b.bestFor) err(at, '向いている人（bestFor）が無い');
        if (!b.desc) err(at, '説明文（desc）が無い');
      }

      // 分野の指定が STAGES に対して妥当か（説明文のキーワードとの突き合わせ）
      const kw = STAGE_KEYWORDS[s.dir]?.[b.stage];
      if (kw && b.desc) {
        const hay = `${b.name} ${b.official || ''} ${b.subjects || ''} ${b.desc}`;
        if (!kw.some(k => hay.includes(k))) {
          warn(at, `役割「${d.stages[b.stage].label}」だが説明文に ${kw.join('・')} のいずれも出てこない`);
        }
      }

      // シリーズ本（レベル別・分冊）は、巻によって到達点が変わるので範囲を持っているはず。
      // 「45〜65」だけでなく、このサイトが広く使う開いた範囲「〜70」も範囲として認める
      // （下限を書かないのは「最初の巻から」の意味で、数値を単独で読ませてはいない）。
      // 参照系（全レベル・全期間・通読）は通読して終える本ではなく、到達点そのものを
      // 持たないので範囲を求めない。数字を足して黙らせると、確認していない数字を置くことになる。
      const ser = seriesOf(b);
      if (ser && ser.kind !== 'reference' && !hensachiPlain(b).includes('〜')) {
        warn(at, `${ser.label} なのに到達目安が範囲になっていない（${b.hensachi}）`);
      }
      void ids;
    }
  }
}

/* ============================================================
   2. テキスト検査
   ============================================================ */

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const CYRILLIC = /[Ѐ-ӿ]/;
// ギリシャ文字は書名に実在する（リードα・ExcelΑ・βなど）ので、
// 数学記号として使われる範囲だけを許し、それ以外を弾く
const GREEK_OK = /[αβγΑΒΓπμλΔΩθφρστεδ]/;
const GREEK = /[Ͱ-Ͽ]/g;

/**
 * JIS X 0208 / 0213 に無い CJK 文字を返す。
 *
 * 日本語環境で encode できない漢字＝日本語の文章に入るはずのない字。
 * 簡体字（训・练・这・说 など）はここで引っかかる。LLM で下書きを作ると
 * 実際に混ざる（2026-09 の点検で「段階的に训练する」「100点까지」が見つかった）。
 *
 * 判定表 build/data/jis-kanji.txt は cp932 / euc_jis_2004 / shift_jis_2004 の
 * いずれかで encode できる CJK 文字を並べたもの。作り直すときは:
 *
 *   python3 -c "
 *   chars=[]
 *   for cp in list(range(0x3400,0x4DC0))+list(range(0x4E00,0xA000))+list(range(0xF900,0xFB00))+list(range(0x20000,0x2A6E0)):
 *       ch=chr(cp)
 *       for enc in ('cp932','euc_jis_2004','shift_jis_2004'):
 *           try: ch.encode(enc); chars.append(ch); break
 *           except Exception: pass
 *   open('build/data/jis-kanji.txt','w').write(''.join(chars))"
 */
const JIS_KANJI = new Set(fs.readFileSync(path.join(ROOT, 'build', 'data', 'jis-kanji.txt'), 'utf8'));

function nonJisCjk(text) {
  const bad = new Set();
  for (const ch of new Set(text)) {
    const cp = ch.codePointAt(0);
    const isCjk = (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff)
      || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0x20000 && cp <= 0x2a6df);
    if (isCjk && !JIS_KANJI.has(ch)) bad.add(ch);
  }
  return [...bad];
}

/**
 * 収録している全書籍の書名（name / official）を、長いものから並べて返す。
 *
 * 誇張語を探す前に文章からこれを取り除く。スタイルガイド 1 節が「同レベルの他書との
 * 違いを 1 点書く」ことを求めている以上、他書の書名（『大森徹の最強講義126講』など）を
 * 引用する説明文は今後も必ず出る。書名をそのまま数えると、書けば書くほど警告が増える。
 *
 * **長い書名から取り除く。**短い書名が先に消えると、長い書名の残りが地の文に見える
 * （『看護・医療系の小論文 最強独学問題集』は『小論文』を先に消すと「最強」が露出する）。
 * 科目をまたいだ引用があるので、対象は全科目の BOOKS を横断して集める。
 */
function bookNames() {
  const names = new Set(BANNED_ALLOW);
  for (const s of SUBJECTS) {
    for (const b of data[s.dir].books) {
      if (b.name) names.add(String(b.name));
      if (b.official) names.add(String(b.official));
    }
  }
  return [...names].sort((a, b) => b.length - a.length);
}

function checkText() {
  // 書名は毎回同じなので 1 度だけ組み立てる（1,390 冊 × 全書名の置換になるため）
  const names = bookNames();
  /** 文章から書名・シリーズ名を取り除く。長いものから消す */
  const stripNames = t => names.reduce((acc, n) => acc.split(n).join(' '), t);

  // --- データの中の文章 ---
  const fields = ['desc', 'bestFor', 'style', 'subjects', 'problems', 'hours', 'hensachi'];
  for (const s of SUBJECTS) {
    for (const b of data[s.dir].books) {
      const at = `${s.dir}/${b.id}`;
      const texts = [];
      for (const f of fields) if (b[f]) texts.push([f, String(b[f])]);
      for (const arr of ['pros', 'cons']) {
        if (Array.isArray(b[arr])) b[arr].forEach((v, i) => texts.push([`${arr}[${i}]`, String(v)]));
      }
      for (const [f, t] of texts) {
        if (HANGUL.test(t)) err(at, `${f} にハングルが混ざっている: ${t.slice(0, 40)}`);
        if (CYRILLIC.test(t)) err(at, `${f} にキリル文字が混ざっている: ${t.slice(0, 40)}`);
        const badGreek = (t.match(GREEK) || []).filter(c => !GREEK_OK.test(c));
        if (badGreek.length) err(at, `${f} に想定外のギリシャ文字: ${badGreek.join('')}`);
        const bad = nonJisCjk(t);
        if (bad.length) err(at, `${f} に簡体字が混ざっている: ${bad.join('')}（${t.slice(0, 40)}）`);
      }
      // 禁止語は書名・正式名称を除いた文章だけを見る（『合格る計算』のような書名は別）。
      // 自分の書名だけでなく、引用した他書の書名も取り除く（docs/style-guide.md 2 節の例外）
      const prose = stripNames(texts.filter(([f]) => f !== 'subjects').map(([, t]) => t).join(' '));
      for (const w of BANNED_WORDS) {
        if (prose.includes(w)) warn(at, `誇張語「${w}」が説明文にある`);
      }
    }
  }
}

/* ============================================================
   3. HTML 検査
   ============================================================ */

function checkHtml(files) {
  const legalSlugs = LEGAL_PAGES.map(p => p.slug);
  const amazon = amazonDisclosure();
  const allPaths = new Set();
  for (const f of files) {
    const r = rel(f);
    allPaths.add(r === 'index.html' ? '/' : `/${path.dirname(r)}/`);
  }

  // 定型段落の検出用。書籍ページの本文段落を集めて、何ページに出るかを数える
  const paraCount = new Map();
  const bookPages = [];

  for (const f of files) {
    const at = rel(f);
    const src = fs.readFileSync(f, 'utf8');
    // <script> と <style> の中はページの本文ではない。テンプレートリテラル
    // （`/english/books/${b.id}/`）をリンクとして数えると必ず切れて見えるし、
    // CSS のコメントに書いた「<select>」を入力欄として数えてしまう
    const markup = src
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '');
    const isBook = /\/books\/[^/]+\/index\.html$/.test(at);
    const noindex = /<meta name="robots" content="[^"]*noindex/.test(src);

    // h1 は 1 ページに 1 つ。見出しの階層も飛ばさない
    // （読み上げは見出しの深さで構造を伝えるので、h2 の次が h4 だと段が抜ける）
    const levels = [...markup.matchAll(/<h([1-6])[\s>]/g)].map(m => Number(m[1]));
    const h1 = levels.filter(l => l === 1).length;
    if (h1 !== 1) err(at, `h1 が ${h1} 個ある（1 個であること）`);
    let prev = 0;
    for (const l of levels) {
      if (prev && l > prev + 1) { err(at, `見出しの階層が飛んでいる（h${prev} → h${l}）`); break; }
      prev = l;
    }

    // 全科目へのナビ
    for (const s of SUBJECTS) {
      if (!src.includes(`href="/${s.dir}/"`) && !src.includes(`href="${ORIGIN}/${s.dir}/"`)) {
        err(at, `グローバルナビに ${s.ja}（/${s.dir}/）へのリンクが無い`);
      }
    }

    // 信頼性ページへのリンクと Amazon の必須表記
    for (const slug of legalSlugs) {
      if (!src.includes(`href="/${slug}/"`)) err(at, `フッターに /${slug}/ へのリンクが無い`);
    }
    if (amazon && !src.includes(amazon)) err(at, 'Amazon アソシエイトの必須表記が無い');

    // title / description
    const title = (src.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    if (!title) err(at, 'title が無い');
    else if ([...title].length > 60) err(at, `title が ${[...title].length} 字（60 字以内）`);
    const desc = (src.match(/<meta name="description" content="([^"]*)"/) || [])[1];
    if (desc === undefined) err(at, 'meta description が無い');
    else {
      // 実際に読まれるのは実体参照を戻した文字列。&amp; を 5 字として数えない
      const plain = unescapeHtml(desc);
      if ([...plain].length > 120) err(at, `meta description が ${[...plain].length} 字（120 字以内）`);
    }

    // canonical（noindex のページには要らない）
    if (!noindex && !/<link rel="canonical" href="https:\/\//.test(src)) err(at, 'canonical が無い');

    // OGP 画像。**指しているファイルが実在すること**を見る。
    // joho / shoron に科目別の画像が無いまま共通画像を指していた状態を二度と作らない
    for (const m of src.matchAll(/<meta (?:property="og:image"|name="twitter:image") content="([^"]+)"/g)) {
      const u = m[1];
      if (!u.startsWith(`${ORIGIN}/`)) { err(at, `og:image が絶対 URL でない（${u}）`); continue; }
      const f = path.join(ROOT, u.slice(ORIGIN.length + 1));
      if (!fs.existsSync(f)) err(at, `og:image のファイルが無い（${u}）`);
    }

    // 書籍ページはその本の OGP を指す（科目共通の画像では、貼っても何の本か分からない）
    if (isBook) {
      const id = at.match(/([^/]+)\/books\/([^/]+)\/index\.html$/);
      const want = `${ORIGIN}/assets/ogp/${id[1]}/${id[2]}.png`;
      if (!src.includes(`<meta property="og:image" content="${want}">`)) {
        err(at, `og:image がこの本の OGP を指していない（${want} のはず）`);
      }
    }

    // 画像の alt
    for (const m of markup.matchAll(/<img\b[^>]*>/g)) {
      if (!/\balt=/.test(m[0])) err(at, `alt の無い img: ${m[0].slice(0, 70)}`);
    }

    // 入力欄には名前が要る。<label for> か aria-label のどちらかで結び付ける
    // （placeholder は名前にならない。入力を始めると消えるため）
    for (const m of markup.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)) {
      const tag = m[0];
      if (/type="(hidden|submit|button)"/.test(tag)) continue;
      if (/aria-label=|aria-labelledby=/.test(tag)) continue;
      const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
      if (id && markup.includes(`<label for="${id}"`)) continue;
      err(at, `名前の無い入力欄: ${tag.slice(0, 80)}`);
    }

    // JSON-LD が妥当な JSON か
    for (const m of src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try { JSON.parse(m[1]); } catch (e) { err(at, `JSON-LD が壊れている: ${e.message}`); }
    }

    // 「本アプリ」などの禁止表現
    for (const w of BANNED_PHRASES) {
      if (src.includes(w)) err(at, `禁止表現「${w}」がある`);
    }

    // 非日本語文字（出力後の最終確認。データ側で直っていれば出ない）
    const body = src.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    if (HANGUL.test(body)) err(at, 'ハングルが混ざっている');
    const badCjk = nonJisCjk(body);
    if (badCjk.length) err(at, `簡体字が混ざっている: ${badCjk.join('')}`);

    // 内部リンク切れ（ページ単位。アンカーは見ない）
    for (const m of markup.matchAll(/href="(\/[^"#?]*)"/g)) {
      const href = m[1];
      if (href.startsWith('/assets/') || /\.[a-z0-9]+$/i.test(href)) continue;
      const target = href.endsWith('/') ? href : `${href}/`;
      if (!allPaths.has(target)) err(at, `内部リンク切れ: ${href}`);
    }

    // 最終更新日
    if (isBook && !/<time datetime="\d{4}-\d{2}-\d{2}">/.test(src)) {
      err(at, '最終更新日（<time datetime>）が無い');
    }

    if (isBook) {
      bookPages.push(at);
      for (const m of src.matchAll(/<p>([^<]{60,})<\/p>/g)) {
        const t = m[1].trim();
        paraCount.set(t, (paraCount.get(t) || 0) + 1);
      }
    }
  }

  // 定型段落。書籍ページの半数以上に同じ段落があれば落とす
  const half = Math.max(2, Math.floor(bookPages.length / 2));
  for (const [t, n] of paraCount) {
    if (n >= half) err('書籍ページ', `${n} / ${bookPages.length} ページに同じ段落がある: 「${t.slice(0, 50)}…」`);
  }
}

/* ============================================================
   4. 孤立ページ
   ============================================================ */

function checkOrphans(files) {
  const linked = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/href="\/([a-z]+)\/books\/([a-z0-9_-]+)\/"/gi)) {
      linked.add(`${m[1]}/${m[2]}`);
    }
  }
  const sitemap = fs.existsSync(path.join(ROOT, 'sitemap.xml'))
    ? fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8') : '';
  for (const s of SUBJECTS) {
    for (const b of data[s.dir].books) {
      const key = `${s.dir}/${b.id}`;
      if (!linked.has(key)) err(key, 'どのページからもリンクされていない（孤立ページ）');
      if (sitemap && !sitemap.includes(`${ORIGIN}/${s.dir}/books/${b.id}/`)) {
        err(key, 'sitemap.xml に載っていない');
      }
    }
    // 逆向き。BOOKS から外したのにページが残っていないか
    const dir = path.join(ROOT, s.dir, 'books');
    const ids = new Set(data[s.dir].books.map(b => b.id));
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !ids.has(e.name)) {
        err(`${s.dir}/books/${e.name}`, 'BOOKS に無いのにページが残っている（孤児ページ）');
      }
    }
  }
}

/* ============================================================
   実行
   ============================================================ */

const files = htmlFiles();
console.log(`HTML ${files.length} 枚・書籍 ${SUBJECTS.reduce((a, s) => a + data[s.dir].books.length, 0)} 冊を検査する`);

checkData();
checkText();
checkHtml(files);
checkOrphans(files);

if (warns.length) {
  console.log(`\n警告 ${warns.length} 件（落とさない）`);
  for (const w of warns.slice(0, 60)) console.log(`  - ${w}`);
  if (warns.length > 60) console.log(`  … ほか ${warns.length - 60} 件`);
}

if (errors.length) {
  console.error(`\nエラー ${errors.length} 件`);
  for (const e of errors.slice(0, 120)) console.error(`  ✗ ${e}`);
  if (errors.length > 120) console.error(`  … ほか ${errors.length - 120} 件`);
  process.exit(1);
}

console.log(`\n検査を通過した（警告 ${warns.length} 件）`);
if (warns.length && !WARN_OK) {
  // 警告だけでは落とさない。書き換えの候補は人が判断する
}
