import test from 'node:test';
import assert from 'node:assert/strict';
import { amazonUrl, rakutenUrl, purchaseLinks } from '../build/lib/purchase.mjs';
import { loadSubjectData } from '../build/lib/load-subject-data.mjs';

const science = loadSubjectData(process.cwd(), 'science');
const book = science.books.find(b => b.id === 'genten-riron');

test('購入先は同じ版の識別子を使い、計測情報と広告開示を保つ', () => {
  const az = new URL(amazonUrl(book, science.config.amazonTag));
  assert.ok(az.pathname.includes(book.isbn10));
  assert.equal(az.searchParams.get('tag'), science.config.amazonTag);
  const rk = new URL(rakutenUrl(book, science.config.rakutenId));
  const dest = new URL(rk.searchParams.get('pc'));
  assert.equal(dest.hostname, 'books.rakuten.co.jp');
  assert.equal(dest.searchParams.get('sitem'), book.isbn13);
  assert.equal(rk.searchParams.get('m'), dest.href);
  const html = purchaseLinks(book, 'science', science.config, 'article');
  assert.match(html, /data-rt-placement="article"/);
  assert.match(html, /data-rt-bid="genten-riron"/);
  assert.match(html, /ISBN 9784796116589/);
  assert.match(html, /rel="nofollow sponsored noopener noreferrer"/);
  assert.match(html, /広告リンク/);
});

test('過去問の枠や複数巻の代表ISBNから特定商品へ誘導しない', () => {
  for (const patch of [{ recordType: 'routePlaceholder' }, { hensachi: '40〜68(6段階)' }, { hensachi: '40〜65(2冊構成)' }, { official: '数学I・A 標準問題精講 四訂版 ほか(全3巻)' }, { official: '入試数学の掌握(全3巻)' }, { official: '数学(年度版・2分冊)' }]) {
    assert.equal(purchaseLinks({ ...book, ...patch }, 'science', science.config, 'route_step'), '');
  }
});

test('広告IDが無いときはタグ・楽天・広告表記を付けず、書名を安全に表示する', () => {
  const html = purchaseLinks({ ...book, official: '<架空>"&' }, 'science', {}, 'article');
  assert.doesNotMatch(html, /sponsored|広告リンク|data-rt-buy="rakuten"|tag=/);
  assert.ok(!html.includes('<架空>'));
  assert.ok(html.includes('&lt;架空&gt;'));
});
