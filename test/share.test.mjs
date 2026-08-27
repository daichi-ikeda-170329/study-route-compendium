/**
 * 診断結果共有機能のテスト。
 *
 *   node --test test/share.test.mjs
 *
 * 外部依存は追加していない（Node 標準の node:test のみ）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadShare, loadQuiz, loadPage, allAnswerCombos, fakeStorage, SUBJECTS } from './helpers.mjs';

const RTShare = loadShare();
const QUIZZES = Object.fromEntries(SUBJECTS.map(s => [s, loadQuiz(s)]));

/* ============================================================
   ルート画面の共有（?rv=1&r=…）
   トークンの組み立てと検証は科目ページ側にある。ページを vm 上で走らせて確かめる。
   ============================================================ */

/** share.js が受け付けるトークン列の書式。restoreRoute の ROUTE_TOKENS_RE と同じ */
const ROUTE_TOKENS_RE = /^[A-Za-z0-9_-]{1,24}(\.[A-Za-z0-9_-]{1,24}){0,7}$/;

const PAGES = Object.fromEntries(SUBJECTS.map(s => [s, loadPage(s)]));

test('全科目に route の共有設定がある', () => {
  for (const subject of SUBJECTS) {
    const { cfg } = PAGES[subject];
    assert.equal(typeof cfg.route?.encode, 'function', `${subject}: encode が無い`);
    assert.equal(typeof cfg.route?.apply, 'function', `${subject}: apply が無い`);
    assert.equal(typeof cfg.route?.show, 'function', `${subject}: show が無い`);
  }
});

test('志望レベルを選ぶ前は共有できない', () => {
  for (const subject of SUBJECTS) {
    const { ctx, cfg } = loadPage(subject);
    ctx.S.tier = null;
    ctx.S.mode = 'tier';
    if ('sensei' in ctx.S) ctx.S.sensei = null;
    assert.equal(cfg.route.encode(), null, `${subject}: 志望レベル未選択でも共有 URL を作った`);
  }
});

test('全科目・全志望レベルで encode→apply→encode が同じトークンに戻る', () => {
  for (const subject of SUBJECTS) {
    const { ctx, cfg } = PAGES[subject];
    for (const t of ctx.TIERS) {
      ctx.selectTier(t.id);
      const st = cfg.route.encode();
      assert.ok(st && Array.isArray(st.tokens) && st.tokens.length,
        `${subject}/${t.id}: encode がトークンを返さない`);
      const joined = st.tokens.join('.');
      assert.match(joined, ROUTE_TOKENS_RE, `${subject}/${t.id}: トークンの書式が share.js の検証を通らない`);
      assert.equal(cfg.route.apply(st.tokens, st.uni || ''), true,
        `${subject}/${t.id}: 自分が作ったトークンを apply が拒んだ (${joined})`);
      assert.deepEqual(cfg.route.encode().tokens, st.tokens,
        `${subject}/${t.id}: apply 後の encode が元と一致しない`);
    }
  }
});

test('講師ルートも往復する（英語のみ）', () => {
  const { ctx, cfg } = loadPage('english');
  for (const s of ctx.SENSEIS) {
    ctx.selectSensei(s.id);
    const st = cfg.route.encode();
    assert.ok(st && st.tokens[0] === 's', `english/${s.id}: 講師ルートを encode できない`);
    assert.match(st.tokens.join('.'), ROUTE_TOKENS_RE);
    assert.equal(cfg.route.apply(st.tokens, ''), true, `english/${s.id}: apply が拒んだ`);
    assert.deepEqual(cfg.route.encode().tokens, st.tokens);
  }
});

test('実在しない値のトークンは受け付けない', () => {
  for (const subject of SUBJECTS) {
    const { ctx, cfg } = PAGES[subject];
    ctx.selectTier(ctx.TIERS[0].id);
    const good = cfg.route.encode().tokens;

    const bad = [
      [],                                                  // 空
      good.slice(0, good.length - 1),                      // 個数が足りない
      good.concat('0'),                                    // 個数が多い
      ['z'].concat(good.slice(1)),                         // 種類が違う
      [good[0], 'no-such-tier'].concat(good.slice(2)),     // 志望レベルが実在しない
      good.slice(0, good.length - 1).concat('9'),          // 現在地が範囲外
    ];
    for (const tk of bad) {
      assert.equal(cfg.route.apply(tk, ''), false,
        `${subject}: 不正なトークンを受け入れた ${JSON.stringify(tk)}`);
    }
  }
});

test('共有 URL の大学名は UNIS と一致するときだけ使う', () => {
  for (const subject of SUBJECTS) {
    const { ctx, cfg } = loadPage(subject);
    ctx.selectTier(ctx.TIERS[0].id);
    const tokens = cfg.route.encode().tokens;

    assert.equal(cfg.route.apply(tokens, '架空大学'), true, `${subject}: 未知の大学名で apply が失敗した`);
    assert.equal(ctx.S.mode, 'tier', `${subject}: 未知の大学名で志望校モードに入った`);

    const uni = ctx.UNIS[0];
    assert.equal(cfg.route.apply(tokens, uni.n), true, `${subject}: 実在する大学名で apply が失敗した`);
    assert.equal(ctx.S.mode, 'uni', `${subject}: 実在する大学名なのに志望校モードにならない`);
    assert.equal(ctx.S.uni.n, uni.n, `${subject}: 別の大学が選ばれた`);
  }
});

/* ============================================================
   ラウンドトリップ — 全科目・到達しうる全パターン
   ============================================================ */

test('全科目の全回答パターンで encode→decode が元の回答に戻る', () => {
  for (const subject of SUBJECTS) {
    const quiz = QUIZZES[subject];
    const combos = allAnswerCombos(quiz);
    assert.ok(combos.length > 0, `${subject}: 組み合わせが 0 件`);
    for (const ans of combos) {
      const qs = RTShare.encodeAnswers(quiz, ans);
      assert.equal(typeof qs, 'string', `${subject}: encode に失敗 ${JSON.stringify(ans)}`);
      const res = RTShare.decodeAnswers(quiz, qs);
      assert.equal(res.ok, true, `${subject}: decode に失敗 ${qs} (${res.reason})`);
      assert.deepEqual(res.ans, ans, `${subject}: 復元結果が一致しない ${qs}`);
    }
  }
});

test('境界値（全て最初の選択肢 / 全て最後の選択肢）がラウンドトリップする', () => {
  for (const subject of SUBJECTS) {
    const quiz = QUIZZES[subject];
    for (const pick of ['first', 'last']) {
      const ans = {};
      for (const q of quiz) {
        if (q.cond && !q.cond(ans)) continue;
        ans[q.key] = pick === 'first' ? q.opts[0].v : q.opts[q.opts.length - 1].v;
      }
      const qs = RTShare.encodeAnswers(quiz, ans);
      const res = RTShare.decodeAnswers(quiz, qs);
      assert.equal(res.ok, true, `${subject}/${pick}: decode 失敗`);
      assert.deepEqual(res.ans, ans, `${subject}/${pick}: 不一致`);
    }
  }
});

test('同じ回答からは常に同じ URL が出る（一意性）', () => {
  for (const subject of SUBJECTS) {
    const quiz = QUIZZES[subject];
    const seen = new Map();
    for (const ans of allAnswerCombos(quiz)) {
      const qs = RTShare.encodeAnswers(quiz, ans);
      const key = JSON.stringify(ans);
      if (seen.has(qs)) {
        assert.equal(seen.get(qs), key, `${subject}: 異なる回答が同じ URL になった ${qs}`);
      }
      seen.set(qs, key);
    }
  }
});

test('条件分岐で表示されない質問に残った回答は共有 URL に載らない', () => {
  const quiz = QUIZZES.english;
  /* tier2 は tier==="top" のときだけ表示される。tier を march に変えても tier2 が残っている状態 */
  const dirty = { bunri: 'bun', tier: 'march', tier2: 'sokei', level: '1', time: 'mid' };
  const clean = { bunri: 'bun', tier: 'march', level: '1', time: 'mid' };
  assert.equal(RTShare.encodeAnswers(quiz, dirty), RTShare.encodeAnswers(quiz, clean));
  const res = RTShare.decodeAnswers(quiz, RTShare.encodeAnswers(quiz, dirty));
  assert.deepEqual(res.ans, clean);
});

test('表示される質問が未回答なら共有 URL を作らない', () => {
  const quiz = QUIZZES.english;
  assert.equal(RTShare.encodeAnswers(quiz, { bunri: 'bun', tier: 'march', level: '1' }), null);
  assert.equal(RTShare.encodeAnswers(quiz, { bunri: 'bun', tier: 'top', level: '1', time: 'mid' }), null); /* tier2 が抜けている */
  assert.equal(RTShare.encodeAnswers(quiz, {}), null);
  assert.equal(RTShare.encodeAnswers(quiz, null), null);
});

test('buildShareURL がページ URL のパラメータとハッシュを落として組み立てる', () => {
  const quiz = QUIZZES.math;
  const ans = { bunri: 'ri', tier: 'kyote', level: '0', time: 'short' };
  assert.equal(
    RTShare.buildShareURL(quiz, ans, 'https://route-taizen.com/math/?old=1#quiz'),
    'https://route-taizen.com/math/?v=1&a=2.1.0.1.3'
  );
  assert.equal(RTShare.buildShareURL(quiz, {}, 'https://route-taizen.com/math/'), null);
});

/* ============================================================
   不正入力 — すべて {ok:false} になること
   ============================================================ */

test('不正な URL パラメータはすべてフォールバックする', () => {
  const quiz = QUIZZES.english; /* 5 問。tier2 は tier==="top" のときだけ表示 */
  const valid = 'v=1&a=1.2.0.2.2';
  assert.equal(RTShare.decodeAnswers(quiz, valid).ok, true, '前提とする有効な URL が通っていない');

  const bad = [
    ['', 'パラメータなし'],
    ['v=1', 'a がない'],
    ['a=1.2.0.2.2', 'v がない'],
    ['v=0&a=1.2.0.2.2', 'v=0'],
    ['v=2&a=1.2.0.2.2', '未対応の v'],
    ['v=abc&a=1.2.0.2.2', 'v が数値でない'],
    ['v=01&a=1.2.0.2.2', 'v の先頭ゼロ'],
    ['v=1.0&a=1.2.0.2.2', 'v が小数'],
    ['v=&a=1.2.0.2.2', 'v が空'],
    ['v=1&a=', 'a が空'],
    ['v=1&a=1.2.0.2', '要素数が足りない'],
    ['v=1&a=1.2.0.2.2.1', '要素数が多い'],
    ['v=1&a=0.2.0.2.2', '表示される質問が 0'],
    ['v=1&a=1.3.1.2.2', 'tier=march なのに tier2 に回答がある'],
    ['v=1&a=1.5.0.2.2', 'tier=top なのに tier2 が 0'],
    ['v=1&a=1.5.5.2.2', 'tier2 が範囲外'],
    ['v=1&a=3.2.0.2.2', '第1問が範囲外'],
    ['v=1&a=1.2.0.2.9', '最終問が範囲外'],
    ['v=1&a=1.2.0.2.99', '巨大な値'],
    ['v=1&a=1.2.0.2.-1', '負数'],
    ['v=1&a=1.2.0.2.1.5', '小数のような書式'],
    ['v=1&a=1.2.0.2.abc', '非数値'],
    ['v=1&a=1.2.0.2.２', '全角数字'],
    ['v=1&a=1.2.0.2.あ', '非 ASCII'],
    ['v=1&a=01.2.0.2.2', '先頭ゼロ'],
    ['v=1&a=1,2,0,2,2', '区切りがカンマ'],
    ['v=1&a=1-2-0-2-2', '区切りがハイフン'],
    ['v=1&a=1.2.0.2.2.', '末尾に区切り'],
    ['v=1&a=.1.2.0.2.2', '先頭に区切り'],
    ['v=1&a=1..2.0.2.2', '区切りの連続'],
    ['v=1&a=1.2.0.2.2&a=1.2.0.2.1', 'a が重複'],
    ['v=1&v=2&a=1.2.0.2.2', 'v が重複'],
    ['v=1&a=<script>alert(1)</script>', 'スクリプト片'],
    ['v=1&a=%3Cscript%3E', 'エンコードされたスクリプト片'],
    ['v=1&a[]=1.2.0.2.2', '配列風のパラメータ名'],
    ['V=1&A=1.2.0.2.2', 'パラメータ名の大文字'],
    ['v=1&a=1.2.0.2.2 ', '末尾に空白'],
    ['v=1&a=Infinity', 'Infinity'],
    ['v=1&a=NaN', 'NaN'],
    ['v=1&a=1e2.2.0.2.2', '指数表記'],
  ];

  for (const [qs, note] of bad) {
    const res = RTShare.decodeAnswers(quiz, qs);
    assert.equal(res.ok, false, `${note}（${qs}）が通ってしまった`);
    assert.equal(typeof res.reason, 'string');
  }
  assert.ok(bad.length >= 30, '不正入力のケースが 30 未満');
});

test('パラメータの順序が入れ替わっても復元できる', () => {
  const quiz = QUIZZES.english;
  const a = RTShare.decodeAnswers(quiz, 'v=1&a=1.2.0.2.2');
  const b = RTShare.decodeAnswers(quiz, 'a=1.2.0.2.2&v=1');
  assert.equal(b.ok, true);
  assert.deepEqual(b.ans, a.ans);
});

test('共有リンクに関係のないパラメータが付いていても無視して復元する', () => {
  const quiz = QUIZZES.english;
  const res = RTShare.decodeAnswers(quiz, 'utm_source=x&v=1&a=1.2.0.2.2&gclid=abc');
  assert.equal(res.ok, true);
});

test('URLSearchParams をそのまま渡しても動く', () => {
  const quiz = QUIZZES.english;
  const res = RTShare.decodeAnswers(quiz, new URLSearchParams('?v=1&a=1.2.0.2.2'));
  assert.equal(res.ok, true);
});

test('QUIZ が空・不正なら復元しない', () => {
  assert.equal(RTShare.decodeAnswers([], 'v=1&a=1').ok, false);
  assert.equal(RTShare.decodeAnswers(null, 'v=1&a=1').ok, false);
  assert.equal(RTShare.decodeAnswers([{ key: 'x' }], 'v=1&a=1').ok, false);
});

test('復元した回答の値は必ず選択肢の定義済みの値である', () => {
  for (const subject of SUBJECTS) {
    const quiz = QUIZZES[subject];
    for (const ans of allAnswerCombos(quiz)) {
      const res = RTShare.decodeAnswers(quiz, RTShare.encodeAnswers(quiz, ans));
      for (const [key, value] of Object.entries(res.ans)) {
        const q = quiz.find(x => x.key === key);
        assert.ok(q, `${subject}: 未知のキー ${key}`);
        assert.ok(q.opts.some(o => o.v === value), `${subject}: 未定義の値 ${key}=${value}`);
      }
    }
  }
});

/* ============================================================
   URL の長さ
   ============================================================ */

test('共有 URL が 2,000 文字を大きく下回る', () => {
  let longest = 0;
  for (const subject of SUBJECTS) {
    const quiz = QUIZZES[subject];
    for (const ans of allAnswerCombos(quiz)) {
      const url = RTShare.buildShareURL(quiz, ans, `https://route-taizen.com/${subject}/`);
      longest = Math.max(longest, url.length);
    }
  }
  assert.ok(longest < 200, `最長の共有 URL が ${longest} 文字`);
});

/* ============================================================
   localStorage
   ============================================================ */

test('localStorage が使えない環境では例外を投げず、保存機能を無効と判定する', () => {
  for (const storage of [undefined, fakeStorage({}, 'setItem'), fakeStorage({}, 'all')]) {
    const S = loadShare({ localStorage: storage });
    assert.equal(S.__test.storageOK(), false);
    assert.deepEqual(S.__test.loadStore(), { schemaVersion: 1, items: [] });
  }
});

test('壊れた保存データを読んでも空として扱う', () => {
  const broken = [
    'not json',
    '',
    '{',
    'null',
    '[]',
    '123',
    '"文字列"',
    '{"items":[]}',                                   /* schemaVersion がない */
    '{"schemaVersion":2,"items":[]}',                 /* スキーマ不一致 */
    '{"schemaVersion":1}',                            /* items がない */
    '{"schemaVersion":1,"items":{}}',                 /* items が配列でない */
    '{"schemaVersion":"1","items":[]}',               /* schemaVersion が文字列 */
  ];
  for (const raw of broken) {
    const S = loadShare({ localStorage: fakeStorage({ rt_saved_routes: raw }) });
    const store = S.__test.loadStore();
    assert.equal(store.schemaVersion, 1);
    assert.deepEqual(store.items, [], `${raw} が空にならなかった`);
  }
});

test('型の合わない保存項目だけが捨てられ、正しい項目は残る', () => {
  const good = { id: 'r1', savedAt: '2026-08-26T00:00:00.000Z', subjectId: 'english', answers: '1.2.0.2.2', label: '英語：MARCH' };
  const bads = [
    { ...good, id: 123 },
    { ...good, id: '' },
    { ...good, savedAt: 0 },
    { ...good, subjectId: 'unknown' },
    { ...good, subjectId: 42 },
    { ...good, answers: [1, 2] },
    { ...good, answers: 'abc' },
    { ...good, answers: '01.2' },
    { ...good, label: { t: 1 } },
    { ...good, label: 'x'.repeat(121) },
    null,
    'string',
    42,
    [],
  ];
  const S = loadShare({ localStorage: fakeStorage({ rt_saved_routes: JSON.stringify({ schemaVersion: 1, items: [...bads, good] }) }) });
  const store = S.__test.loadStore();
  assert.equal(store.items.length, 1);
  assert.deepEqual(store.items[0], good);
});

test('HTML 属性やスクリプトの文脈を抜け出せる id を持つ項目は読み込まない', () => {
  const base = { savedAt: '2026-08-26T00:00:00.000Z', subjectId: 'english', answers: '1.3.0.2.2', label: 'ラベル' };
  const S = loadShare({ localStorage: fakeStorage() });
  const badIds = [
    "a');window.x=1;//",      /* onclick の文字列を閉じる細工 */
    'a"><img src=x onerror=alert(1)>',
    "a'",
    'a"',
    'a>',
    'a<',
    'a&',
    'a b',
    'a\n',
    '../../etc/passwd',
    'a'.repeat(41),
    '',
  ];
  for (const id of badIds) {
    assert.equal(S.__test.validItem({ ...base, id }), false, `id=${JSON.stringify(id)} が通ってしまった`);
  }
  for (const id of ['r1', 'rmt8xd96os36l5n', 'A-b_9', 'x'.repeat(40)]) {
    assert.equal(S.__test.validItem({ ...base, id }), true, `id=${id} が弾かれた`);
  }
});

test('保存一覧の HTML は id を onclick に埋め込まない', () => {
  const S = loadShare({ localStorage: fakeStorage() });
  const item = { id: 'r1abc', savedAt: '2026-08-26T00:00:00.000Z', subjectId: 'english', answers: '1.3.0.2.2', label: 'ラベル' };
  S.__test.saveStore({ schemaVersion: 1, items: [item] });
  /* setup を通さないと CFG が無く一覧を作れないので、最小の QUIZ で用意する */
  S.setup({
    quiz: [{ key: 'a', opts: [{ v: 'x' }, { v: 'y' }] }],
    subject: 'english', subjectLabel: '英語',
    state: { ans: { a: 'x' } },
    showResult() {}, renderQuiz() {}, restart() {},
  });
  const html = S.beforeQuiz(0);
  assert.ok(html.includes('data-rt-id="r1abc"'), 'data 属性に id が入っていない');
  assert.ok(!/onclick=/.test(html), '保存一覧に onclick が残っている');
});

test('保存項目の answers は共有 URL と同じ検証を通る', () => {
  const S = loadShare({ localStorage: fakeStorage() });
  const quiz = QUIZZES.english;
  const ans = { bunri: 'bun', tier: 'top', tier2: 'sokei', level: '2', time: 'long' };
  const tokens = S.encodeTokens(quiz, ans);
  assert.ok(S.__test.validItem({ id: 'r1', savedAt: '2026-08-26T00:00:00.000Z', subjectId: 'english', answers: tokens, label: 'x' }));
  const res = S.decodeAnswers(quiz, `v=${S.SCHEMA_VERSION}&a=${tokens}`);
  assert.equal(res.ok, true);
  assert.deepEqual(res.ans, ans);
});

test('保存できたデータは同じ内容で読み戻せる', () => {
  const storage = fakeStorage();
  const S = loadShare({ localStorage: storage });
  const item = { id: 'r1', savedAt: '2026-08-26T00:00:00.000Z', subjectId: 'math', answers: '2.1.0.1.3', label: '数学：共通テスト対策' };
  assert.equal(S.__test.saveStore({ schemaVersion: 1, items: [item] }), true);
  assert.deepEqual(S.__test.loadStore().items, [item]);
});

/* ============================================================
   スキーマの取り違えを防ぐ
   ============================================================ */

/**
 * 各科目の QUIZ の「形」を固定する。
 *
 * 共有 URL のトークンは選択肢の並び順そのものなので、質問や選択肢を並べ替えると、
 * 過去に共有された URL が別の回答として復元される。要素数が変われば長さの検証で弾けるが、
 * 並べ替えは弾けない。ほかのテストは実際の QUIZ から組み合わせを作るため、
 * 並べ替えても全部通ってしまう。ここだけは値を固定して、変更に必ず気づけるようにする。
 */
const QUIZ_FINGERPRINTS = {
  english:  '8f4d818a2b8185f7',
  japanese: '22effa6ade60dcfd',
  math:     '8f4d818a2b8185f7',   /* english と同じ構造なので指紋も一致する */
  science:  'b2612fadae5d5918',
  social:   '34d3b95877fc7d10',
};

function fingerprint(quiz) {
  const shape = JSON.stringify(quiz.map(q => [
    q.key,
    q.opts.map(o => o.v),
    q.cond ? String(q.cond).replace(/\s+/g, '') : null,
  ]));
  return crypto.createHash('sha256').update(shape).digest('hex').slice(0, 16);
}

test('QUIZ の構造が変わっていない（変えたなら SCHEMA_VERSION の判断が要る）', () => {
  for (const subject of SUBJECTS) {
    const actual = fingerprint(QUIZZES[subject]);
    assert.equal(actual, QUIZ_FINGERPRINTS[subject],
      `${subject} の QUIZ の構造が変わっている。\n`
      + `  質問・選択肢の「追加・削除・並べ替え」か cond の変更をしたなら、\n`
      + `  assets/js/share.js の SCHEMA_VERSION を上げ、旧バージョンの扱いを決めること。\n`
      + `  表示文言だけを直したのであればバージョンは据え置きでよい。\n`
      + `  いずれの場合も、判断したうえで QUIZ_FINGERPRINTS の値を ${actual} に更新する。`);
  }
});

test('指紋は選択肢の並べ替えを検出する', () => {
  const quiz = QUIZZES.english;
  const swapped = quiz.map((q, i) => (i === 1 ? { ...q, opts: [q.opts[1], q.opts[0], ...q.opts.slice(2)] } : q));
  assert.notEqual(fingerprint(swapped), fingerprint(quiz));
});
