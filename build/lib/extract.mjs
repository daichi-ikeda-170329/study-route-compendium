/**
 * 各科目の単一 HTML から、ページ生成に必要なデータを取り出す。
 *
 * 科目ページはビルド工程を持たない単一 HTML なので、データは <script> の中に
 * リテラルとして書かれている。ここでは script を切り出して vm 上で実行し、
 * DOM 依存の初期化処理はスタブで空振りさせたうえで、定数だけを回収する。
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

/** DOM API を「何を呼んでも落ちない」オブジェクトとして代替する */
const stub = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()),
  set: () => true,
  apply: () => stub(),
  construct: () => stub(),
});

/** 科目ページが持つトップレベル定数。const のままだと vm の外から読めないので globalThis に移す */
const WANTED = ['BOOKS', 'UNIS', 'TIERS', 'ROUTES', 'GUIDES', 'STAGES', 'CONFIG'];

/**
 * @param {string} rootDir リポジトリのルート
 * @param {string} dir     科目ディレクトリ名
 * @param {string} [srcOverride] ファイルの代わりに読む HTML。
 *   build/apply-new-books.mjs が「新刊を注入する前の状態」を基準にするために使う。
 *   ファイルをそのまま読むと、前回自分が注入した本まで既存書として数えてしまい、
 *   2 回目の実行が id の衝突として落ちる。
 */
export function extractSubject(rootDir, dir, srcOverride = null) {
  const file = path.join(rootDir, dir, 'index.html');
  const src = srcOverride ?? fs.readFileSync(file, 'utf8');
  const scripts = [...src.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]);

  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    document: stub(), window: stub(), localStorage: stub(), navigator: stub(),
    setTimeout() {}, setInterval() {}, addEventListener() {}, requestAnimationFrame() {},
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const re = new RegExp(`\\bconst (${WANTED.join('|')})\\s*=`, 'g');
  for (const code of scripts) {
    try {
      vm.runInContext(code.replace(re, 'globalThis.$1 ='), ctx, { timeout: 30000 });
    } catch {
      // 初期化処理が DOM に触れて落ちるのは想定内。定数の定義はその前に済んでいる
    }
  }

  const books = ctx.BOOKS;
  if (!Array.isArray(books) || books.length === 0) {
    throw new Error(`${dir}: BOOKS を取り出せなかった`);
  }
  const ids = books.map(b => b.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) throw new Error(`${dir}: id が重複している — ${[...new Set(dup)].join(', ')}`);
  const badId = ids.filter(id => !/^[a-z0-9][a-z0-9_-]*$/i.test(id));
  if (badId.length) throw new Error(`${dir}: URL に使えない id — ${badId.join(', ')}`);

  return {
    dir,
    books,
    stages: ctx.STAGES || {},
    tiers: Array.isArray(ctx.TIERS) ? ctx.TIERS : [],
    routes: ctx.ROUTES || {},
    unis: Array.isArray(ctx.UNIS) ? ctx.UNIS : [],
    guides: Array.isArray(ctx.GUIDES) ? ctx.GUIDES : [],
    config: ctx.CONFIG || {},
  };
}

/**
 * サイト全体でアフィリエイトを利用しているかを、各科目の CONFIG から判定する。
 *
 * 生成ページの広告表記はここを唯一の根拠にする。ID が未設定のうちは
 * 「アフィリエイト広告を利用しています」と書かない（事実に反するため）。
 * ID を入れて再生成すれば、必要な表記が自動で戻る。
 * <script> を実行せずに済むよう、CONFIG の該当行だけを読む。
 */
let affCache = null;
export function affiliateEnabled(rootDir) {
  if (affCache !== null) return affCache;
  affCache = SUBJECTS.some(s => {
    const src = fs.readFileSync(path.join(rootDir, s.dir, 'index.html'), 'utf8');
    const tag = src.match(/\bamazonTag:\s*"([^"]*)"/);
    const rak = src.match(/\brakutenId:\s*"([^"]*)"/);
    return Boolean((tag && tag[1]) || (rak && rak[1]));
  });
  return affCache;
}

/**
 * Amazon アソシエイトの ID だけが入っているかを判定する。
 * Amazon の運営規約が求める「適格販売により収入を得ています」の表記は、
 * Amazon に参加しているときだけ出す（楽天だけの状態で出すと事実に反する）。
 */
let azCache = null;
export function amazonEnabled(rootDir) {
  if (azCache !== null) return azCache;
  azCache = SUBJECTS.some(s => {
    const src = fs.readFileSync(path.join(rootDir, s.dir, 'index.html'), 'utf8');
    const tag = src.match(/\bamazonTag:\s*"([^"]*)"/);
    return Boolean(tag && tag[1]);
  });
  return azCache;
}

/** サイト共通の科目メタ情報。冊数は BOOKS から実測するのでここには持たない */
export const SUBJECTS = [
  { dir: 'english',  ja: '英語', mark: '英', en: 'ENGLISH',        color: '#B5432A',
    full: '英語ルート大全', fields: '単語・文法・英文解釈・長文・英作文・リスニング' },
  { dir: 'japanese', ja: '国語', mark: '国', en: 'JAPANESE',       color: '#8A6D2F',
    full: '国語ルート大全', fields: '現代文・古文・漢文' },
  { dir: 'math',     ja: '数学', mark: '数', en: 'MATHEMATICS',    color: '#24427C',
    full: '数学ルート大全', fields: '数学I・A / II・B・C / III・C' },
  { dir: 'science',  ja: '理科', mark: '理', en: 'SCIENCE',        color: '#2F6E4F',
    full: '理科ルート大全', fields: '物理・化学・生物・地学' },
  { dir: 'social',   ja: '社会', mark: '社', en: 'SOCIAL STUDIES', color: '#5B4E9E',
    full: '社会ルート大全', fields: '日本史・世界史・地理・公民' },
  // 図鑑と書籍ページだけを持つ科目。志望校別ルート・3 分診断・学習ガイドは無い。
  // catalogOnly を見て generate-routes / generate-picks は飛ばす（ROUTES が無いため）。
  // OGP は科目別の画像が作れないので（assets/ogp*.png は元の SVG も生成手順も残っていない）
  // 共通の ogp.png を指す。ogp フィールドが無い科目は従来どおり ogp-<dir>.png を使う。
  { dir: 'joho',     ja: '情報', mark: '情', en: 'INFORMATICS',    color: '#1F6E7A',
    full: '情報ルート大全', fields: '情報I（共通テスト）',
    catalogOnly: true, ogp: 'ogp.png' },
  { dir: 'shoron',   ja: '小論文', mark: '論', en: 'ESSAY',        color: '#8E3B5E',
    full: '小論文ルート大全', fields: '書き方・型・ネタ・学部別',
    catalogOnly: true, ogp: 'ogp.png' },
];

export const ORIGIN = 'https://route-taizen.com';

/**
 * 公式 X アカウントのハンドル（@ を除く）。
 * 共有ボタンの via= と twitter:site メタに使う。手書き HTML（ポータル・科目トップ 5 枚・404）と
 * assets/js/share.js にも同じ値を書いてあるので、変えるときは `rg route_taizen` で全箇所を出す。
 */
export const X_HANDLE = 'route_taizen';

/** 分野コード（BOOKS[].sub）の表示名。科目をまたいで衝突しないので 1 つの辞書で足りる */
export const SUB_LABELS = {
  gendai: '現代文', kobun: '古文', koten: '古文', kanbun: '漢文', sogo: '総合',
  butsuri: '物理', kagaku: '化学', seibutsu: '生物', chigaku: '地学',
  nihonshi: '日本史', sekaishi: '世界史', chiri: '地理',
  kokyo: '公共', seikei: '政治・経済', rinri: '倫理',
};

/** HTML に埋める文字列のエスケープ */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** meta description / og:description 用。改行と連続空白を潰し、指定長で切る */
export function clip(s, max) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max - 1) + '…';
}
