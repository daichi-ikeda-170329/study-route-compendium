/**
 * Google AdSense。広告の出力はこのファイル 1 か所で決まる。
 *
 * ADSENSE_CLIENT が空のあいだは、ローダーも広告枠も一切出力しない。
 * 未承認の状態で広告関連の記述をページに残さないため（アフィリエイト ID と同じ考え方）。
 *
 * ID の書き換えは手でやらない。`node build/apply-adsense.mjs <ca-pub-…>` が
 * このファイルと手書き HTML 7 枚、ads.txt をまとめて更新する。
 */

/** AdSense のパブリッシャー ID（例 "ca-pub-1234567890123456"）。空なら広告を出さない */
export const ADSENSE_CLIENT = 'ca-pub-4704595822429716';

/**
 * 手動で貼る広告ユニットのスロット ID。AdSense の管理画面で
 * 「広告ユニットごと」→「ディスプレイ広告」を作ると発行される 10 桁の数値。
 * 空のままなら、その位置には何も出さない（自動広告だけが動く）。
 */
export const AD_SLOTS = {
  inArticle: '',   // 本文の途中（記事・書籍ページ）
  bottom: '',      // 本文の終わり（全生成ページ）
};

/** 広告を出す状態かどうか */
export const ADSENSE = Boolean(ADSENSE_CLIENT);

/**
 * AdSense のローダー。全ページの <head> に静的に置く。
 *
 * 審査時、Google のクローラーは HTML そのものからこのタグを探す。
 * JS で後から差し込む形にすると検出されないことがあるため、必ず静的に書き出す。
 */
export function adsenseLoader() {
  if (!ADSENSE) return '';
  return `<!-- Google AdSense -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></` + `script>`;
}

/**
 * 広告 1 枠。スロット ID が未設定なら空文字を返すので、呼び出し側で条件分岐しなくてよい。
 *
 * 「広告」の見出しを必ず添える。AdSense のポリシーは広告をコンテンツと
 * 誤認させる配置を禁じており、ラベルを付けるのが最も確実な満たし方になる。
 *
 * 空でないときは前後の改行とインデントも自分で持つ。呼び出し側は直前の行の末尾に
 * そのまま置く。広告が無効なときに空行だけが生成物に残るのを避けるため。
 *
 * @param {'inArticle'|'bottom'} key AD_SLOTS のキー
 * @param {string} indent 出力するマークアップの字下げ
 */
export function adUnit(key, indent = '    ') {
  const slot = AD_SLOTS[key];
  if (!ADSENSE || !slot) return '';
  const i = indent;
  return `\n\n${i}<aside class="ad-slot" aria-label="広告">
${i}  <span class="ad-slot__t">広告</span>
${i}  <ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE_CLIENT}" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="true"></ins>
${i}  <script>(adsbygoogle = window.adsbygoogle || []).push({});</` + `script>
${i}</aside>`;
}
