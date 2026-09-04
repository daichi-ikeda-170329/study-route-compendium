/**
 * サイト共通の科目メタ情報と、生成でよく使う小さな道具。
 *
 * ここには以前 extractSubject() があり、科目 HTML の <script> を vm 上で実行して
 * BOOKS / UNIS / TIERS / ROUTES / GUIDES / STAGES / CONFIG を回収していた。
 * 2026-09-05 に 7 科目すべてのデータを data/subjects/<科目>/ へ移したので削除した
 * （実装指示書 §25・§26）。**科目データの読み口は build/lib/load-subject-data.mjs だけ。**
 *
 * 移行そのものを行った変換スクリプト（build/migrate-subject.mjs）も、
 * 移行が終わったので削除した。中身は commit 9d4f6a85〜7f596b06 に残っている。
 * 同じ変換をやり直す必要が出たら `git show 9d4f6a85:build/migrate-subject.mjs` で取り出す。
 */

/*
 * アフィリエイト表記の判定は build/lib/load-subject-data.mjs へ移した。
 *
 * ここには以前 affiliateEnabled() / amazonEnabled() があり、科目 HTML を
 * 正規表現で直接読んで ID の有無を見ていた。
 *
 *     const tag = src.match(/\bamazonTag:\s*"([^"]*)"/);
 *
 * データを HTML の外へ出すと、この正規表現は何にもマッチしなくなり、**例外も警告も
 * 出さずに戻り値が false になる**。その結果、生成される 1,390 ページから
 * アフィリエイト開示と Amazon アソシエイトの必須表記がまるごと消える。
 * 表示崩れではなく規約違反なので、canonical な CONFIG から判定する形へ移した。
 * **ここに正規表現で読む実装を戻さない。**（test/affiliate-disclosure.test.mjs が固定している）
 */

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
  { dir: 'joho',     ja: '情報', mark: '情', en: 'INFORMATICS',    color: '#1F6E7A',
    full: '情報ルート大全', fields: '情報I（共通テスト）', catalogOnly: true },
  { dir: 'shoron',   ja: '小論文', mark: '論', en: 'ESSAY',        color: '#8E3B5E',
    full: '小論文ルート大全', fields: '書き方・型・ネタ・学部別', catalogOnly: true },
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
