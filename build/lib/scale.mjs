/**
 * 難易度スケールの定義。サイト全体でここ 1 か所だけを根拠にする。
 *
 * 難易度は **1〜10 の 10 段階**。役割（導入 → 網羅 → 標準 → 応用 → 実戦）は別の軸で、
 * 難易度と混ぜない。「難易度 3 の講義書」と「難易度 3 の問題集」は同じ段の本である。
 *
 * 到達目安の偏差値は**河合塾全統記述模試の換算値**。母集団が違う模試（進研・駿台全国）の
 * 偏差値をそのまま当てると 10 前後ずれる。科目トップのルート画面は模試の種類を選ぶと
 * 全統換算に直してから比較する。
 *
 * 表示は degreeTable() が返す 1 つの HTML に集約する。書籍詳細・参考書一覧・
 * 志望校別ルートから同じものを出す（文言が場所ごとに散ると、また 1〜5 段階と
 * 10 段階が同居する）。
 */
import { esc } from './extract.mjs';

/** 難易度 1〜10 の意味。hensachi は全統記述の換算目安 */
export const LEVELS = [
  { d: 1, band: '教科書・導入', hensachi: '〜40', target: '中学内容の復習から高校の入口' },
  { d: 2, band: '教科書・導入', hensachi: '38〜45', target: '教科書の例題が自力で追える段階' },
  { d: 3, band: '基礎固め', hensachi: '42〜52', target: '共通テストの基礎、日東駒専・産近甲龍の入口' },
  { d: 4, band: '基礎固め', hensachi: '45〜57', target: '共通テスト 6〜7 割、日東駒専・産近甲龍' },
  { d: 5, band: '入試標準', hensachi: '50〜62', target: '共通テスト 7〜8 割、地方国公立・中堅私大' },
  { d: 6, band: '入試標準', hensachi: '55〜65', target: 'MARCH・関関同立、地方国公立の二次' },
  { d: 7, band: '難関大', hensachi: '58〜68', target: '早慶・上智、地方旧帝' },
  { d: 8, band: '難関大', hensachi: '62〜70', target: '早慶の上位学部、旧帝大' },
  { d: 9, band: '最難関', hensachi: '65〜73', target: '東大・京大、国公立医学部' },
  { d: 10, band: '最難関', hensachi: '68〜', target: '東大・京大で差がつく問題まで' },
];

/** 役割の 5 段階（難易度とは別軸）。説明文で両者を混ぜないための言葉の定義 */
export const ROLES = [
  ['導入', '教科書の内容を、話し言葉に近い説明でゼロから入れ直す本'],
  ['網羅', 'その科目で出る型を一通り並べ、辞書のように引ける本'],
  ['標準', '入試で実際に問われる形に直した、標準レベルの演習書'],
  ['応用', '難関大の入試問題を素材にした、上位レベルの演習書'],
  ['実戦', '共通テスト・志望校の過去問など、本番の形式で通す本'],
];

/** この難易度が属する帯（10 段階のうちのどのまとまりか） */
export function bandOf(d) {
  return (LEVELS.find(l => l.d === d) || LEVELS[4]).band;
}

/**
 * 難易度の定義表。折りたたみで置く（本文の主役ではないが、
 * 数字を見た人がその場で意味を確かめられる位置に要る）。
 * @param {object} [o] open: 既定で開くか / current: 強調する難易度
 */
export function degreeTable(o = {}) {
  const rows = LEVELS.map(l => `      <tr${o.current === l.d ? ' class="on"' : ''}>
        <th>${l.d}</th><td>${esc(l.band)}</td><td>${esc(l.hensachi)}</td><td>${esc(l.target)}</td>
      </tr>`).join('\n');
  const roles = ROLES.map(([n, t]) => `<li><b>${esc(n)}</b> — ${esc(t)}</li>`).join('');
  return `<details class="scale"${o.open ? ' open' : ''}>
  <summary>難易度 10 段階の意味と、役割との違い</summary>
  <div class="scale__in">
    <p>難易度はサイト全体で共通の <b>1〜10 の 10 段階</b>です。到達目安の偏差値は<b>河合塾全統記述模試の換算値</b>で、進研模試・駿台全国模試の偏差値をそのまま当てると 10 前後ずれます。</p>
    <!-- 横に流す領域はキーボードでもスクロールできるようにする（tabindex="0"）。
         読み上げでは何の表かが分かるよう役割と名前を付ける -->
    <div class="scale__tw" tabindex="0" role="region" aria-label="難易度と到達目安の対応表（横スクロールできます）">
    <table class="scale__t">
      <thead><tr><th>難易度</th><th>帯</th><th>到達目安</th><th>目安となる志望校・到達点</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>
    </div>
    <p class="scale__note"><b>難易度と役割は別の軸です。</b>役割は「その本が学習のどの工程を担当するか」で、次の 5 段階に分かれます。同じ難易度でも役割が違えば使う時期が変わります。</p>
    <ul class="scale__roles">${roles}</ul>
    <p class="scale__note">数字の決め方と、到達目安・想定学習時間の出し方は<a href="/methodology/">データの作り方</a>に書いています。</p>
  </div>
</details>`;
}
