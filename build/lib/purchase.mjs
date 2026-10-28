/** 販売先と広告表記の共通生成。価格・在庫は取得も推定もしない。 */
import { esc } from './extract.mjs';
import { isPlaceholder, placeholderSearchUrl } from './record-type.mjs';
import { seriesOf } from './series.mjs';

export function amazonUrl(b, tag) {
  // ルート上の枠（志望校の過去問など）は特定の商品ではない。/dp/ の直リンクを
  // 出すと、志望校が違う利用者を別大学の 1 冊へ送ってしまう
  if (isPlaceholder(b)) {
    const base = placeholderSearchUrl(b.official || b.name);
    return tag ? `${base}&tag=${tag}` : base;
  }
  const key = b.isbn10 || b.asin;
  const q = encodeURIComponent(b.official || b.name);
  const base = key
    ? `https://www.amazon.co.jp/dp/${key}/ref=nosim`
    : `https://www.amazon.co.jp/s?k=${q}`;
  if (!tag) return base;
  return base + (key ? `?tag=${tag}` : `&tag=${tag}`);
}

/**
 * 楽天アフィリエイトのリンク。科目トップの rakutenURL() と同じ形にそろえる。
 * 検索語を URL のパラメータに入れてから、遷移先 URL 全体をアフィリエイト用に
 * エンコードする。楽天市場全体ではなく楽天ブックスの本だけを検索する。
 *
 * **遷移先は商品ページではなく ISBN の検索結果ページ。**楽天ブックスの商品 URL
 * （books.rakuten.co.jp/rb/<商品ID>/）に入っているのは楽天内部の商品 ID で、
 * ISBN からは作れない。対応表は楽天ブックス系 API（アプリ ID の登録が要る）
 * でしか取れず、このリポジトリはアプリ ID を持っていない。
 * 楽天のアプリ登録は IP アドレスの許可制で、GitHub Actions の実行 IP を
 * 登録しきれないため見送っている（経緯は docs/new-books-plan.md の 3 節）。
 * ボタンの文言を「楽天ブックスで検索」にして、遷移先と表示を一致させてある。
 * 商品 ID を引けるようにしたら、ここと科目トップの rakutenURL() の両方を直す。
 */
export function rakutenUrl(b, id) {
  if (!id) return '';
  // 枠は ISBN を持たない。書名そのままの検索結果へ送る
  const magazine = /月刊|雑誌|定期刊行/.test(b.style || '');
  const query = magazine ? b.name.replace(/^月刊\s*/, '')
    : isPlaceholder(b) ? (b.official || b.name) : (b.isbn13 || b.official || b.name);
  const dest = `https://books.rakuten.co.jp/search?sitem=${encodeURIComponent(query)}&g=${magazine ? '007' : '001'}`;
  const e = encodeURIComponent(dest);
  return `https://hb.afl.rakuten.co.jp/hgc/${id}/?pc=${e}&m=${e}`;
}


/** 特定の一冊だけに販売先を付ける。過去問の枠・シリーズの代表巻へは出さない。 */
export function purchaseLinks(book, dir, config, placement) {
  if (isPlaceholder(book)) return '';
  const series = seriesOf(book);
  if ((series && series.kind !== 'reference') || /全[0-9０-９一二三四五六七八九十]+[巻冊]|[0-9０-９一二三四五六七八九十]+分冊|ほか[（(]/.test(`${book.name} ${book.official || ''}`)) return ''; // 代表 ISBN の巻を全巻分として買わせない
  const az = amazonUrl(book, config.amazonTag);
  const rk = rakutenUrl(book, config.rakutenId);
  const link = (store, url, label, affiliate) => `<a class="${store === 'amazon' ? 'az' : 'rk'}" href="${esc(url)}" target="_blank" rel="nofollow${affiliate ? ' sponsored' : ''} noopener noreferrer" data-rt-buy="${store}" data-rt-bid="${esc(book.id)}" data-rt-sub="${esc(dir)}" aria-label="${esc(book.official || book.name)}：${label}">${label}</a>`;
  return `<p class="buy__edition">${esc(book.official || book.name)}${book.isbn13 ? `／ISBN ${esc(book.isbn13)}` : ''}</p><div class="buy buy--inline" data-rt-placement="${esc(placement)}">`
    + link('amazon', az, 'Amazon で見る', config.amazonTag)
    + (rk ? link('rakuten', rk, '楽天ブックスで検索', config.rakutenId) : '')
    + (config.amazonTag || config.rakutenId ? '<span class="buy__pr">広告リンク</span>' : '')
    + '</div>';
}
