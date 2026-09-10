/**
 * 大学別ページ（/univ/<slug>/）が使う 2 つの導出処理を置く。
 *
 *   matchFeatures()   その大学の出題説明から「対策の要点」を取り出す
 *   recommendBooks()  その大学におすすめの参考書を選ぶ
 *
 * ## なぜ「ルートの先頭 5 冊」ではいけなかったか
 *
 * 2026-09-08 の最初の版は、志望レベルのルートの先頭から順に本を取っていた。
 * これだと**同じ志望レベルの大学がすべて同じ 5 冊**になる。早稲田（超長文・正誤・
 * 自由英作文）と上智（TEAP 利用・語彙）は出題がまるで違うのに、並ぶ本が一致する。
 * ページを 160 枚に増やした意味が無い。
 *
 * ここでは、その大学の出題説明（`universities.json` の `no` / `fx` / `time` /
 * `fix` / `med`）から特徴語を取り出し、ルートに載っている本（代替候補 `alts` も
 * 含む）のうち特徴に噛み合うものを選ぶ。
 *
 * ## 作り話をしないための制約（守ること）
 *
 *   - 特徴は**データに書いてある語**からしか作らない。正規表現が当たらなければ
 *     その特徴は出さない。「早稲田だからきっと長文が多い」のような推測をしない
 *   - おすすめの理由は、当たった特徴語・`BOOKS[].unis` のタグ・ルート上の役割の
 *     いずれかを言い換えただけにする。本の評価を新しく書き足さない
 *   - `unis` のタグから大学名を照合するときは**別名トークンの完全一致か、大学名の
 *     前方一致だけ**を使う。部分一致にすると「京大」が「東京大学」に当たる
 *   - 出題科目として選べない科目（理科の地学が不可、社会の倫理が不可など）の本は
 *     候補から外す。選べない科目の本を薦めるのは誤誘導になる
 */

import { tagParts } from './unitags.mjs';

/* ============================================================
   出題の特徴
   ============================================================ */

/**
 * 科目ごとの特徴テーブル。
 *
 *   key   見出しに出す名前
 *   uni   大学側のテキスト（no / fx / time / fix / med を連結したもの）に当てる
 *   stage その特徴に効く本の stage（BOOKS[].stage）
 *   book  その特徴に効く本の書名・形式（BOOKS[].name + style + subjects + 役割）に当てる
 *   tracks その特徴が効くトラック。国語の「漢文」を古文の本に当てないための絞り込み。
 *          **書かないと分野をまたいで誤爆する。** 現代文の単語集が「漢文」に対応と出る
 *   tip   読者に出す対策の要点。**その大学固有の話は書かない**（データが無いため）
 *
 * 並び順が表示順になる。上ほど「その科目で先に手を打つべきもの」を置く。
 */
export const FEATURES = {
  english: [
    { key: '自由英作文', uni: /自由英作文|意見を述べる|語で書く|エッセイ/, stage: ['eisaku'], book: /自由英作|英作|ライティング/,
      tip: 'テーマについて自分の意見を英語で書かせる形式。減点されない型を先に固定し、書いたものを必ず他人に見てもらう。使い回せる表現を 20〜30 文そろえておくと、本番で書き出しに詰まらない。' },
    { key: '和文英訳', uni: /和文英訳|英訳/, stage: ['eisaku'], book: /英作|英訳|例文/,
      tip: '日本語をそのまま英語に置き換えようとすると崩れる。まず日本語を平易な日本語へ言い換えてから訳す手順（和文和訳）を身につけ、例文を暗唱して使える構文を増やす。' },
    { key: '要約', uni: /要約/, stage: [], book: /要約|論理|パラグラフ/,
      tip: '本文の論理構造をつかめているかを直接測る形式。段落ごとの役割（主張・具体例・反論）を印を付けながら読む練習と、字数内で言い換える練習を分けて行う。' },
    { key: 'リスニング', uni: /リスニング|聞き取り/, stage: ['listening'], book: /リスニング|シャドー/,
      tip: '配点が独立しているので、読解の勉強を続けても伸びない。毎日 15〜30 分、設問の先読みを含めた本番形式で継続する。' },
    { key: '和訳・記述', uni: /和訳|下線部|内容説明|記述|論述/, stage: ['kaishaku'], book: /解釈|構文|和訳|精読/,
      tip: '構文を正確に取れているかがそのまま採点対象になる。長文演習の量を増やす前に、英文解釈の型を 1 冊で固めるほうが結果的に速い。' },
    { key: '長文の分量・速読', uni: /速読|超長文|分量|処理速度|語級|語程度|時間が厳しい|時間との|時間内|長文/, stage: ['chobun'], book: /長文|速読|超長文|多読/,
      tip: '読む速度は語彙と構文が固まってから伸びる。時間を計った演習に切り替え、1 題あたりの持ち時間を先に決めてから解く。' },
    { key: '文法・語法の独立問題', uni: /文法|語法|整序|正誤/, stage: ['bunpo'], book: /文法|語法|正誤|整序/,
      tip: '独立した大問として出る場合、知識の穴がそのまま失点になる。網羅系を 1 冊に決めて周回し、間違えた項目だけ総合英語に戻って読む。' },
    { key: '語彙・熟語', uni: /語彙|単語|熟語/, stage: ['tango', 'jukugo'], book: /単語|熟語|語彙/,
      tip: '語彙が足りないと読解でも英作文でも手が止まる。単語帳は途中で替えず、1 冊を回数で仕上げる。' },
    { key: '会話文', uni: /会話/, stage: [], book: /会話/,
      tip: '会話特有の定型表現は長文の勉強では拾えない。頻出表現をまとめて覚える時間を別に取る。' },
    { key: 'マーク式・共通テスト', uni: /マーク|共通テスト|共テ/, stage: ['kyotest'], book: /共通テスト|マーク|センター/,
      tip: 'マーク式は取りこぼしがそのまま響く。時間内に全問へ到達する形式演習を重ね、迷った問題を捨てる基準を決めておく。' },
  ],

  japanese: [
    { key: '記述・論述', uni: /記述|論述|字程度|字前後|字で|説明せよ/, stage: ['adv'], book: /記述|論述|要約/,
      tip: '設問の条件（字数・要素・指示語の処理）を満たせているかで点が決まる。解答を書いたあとに、模範解答と要素単位で照合する手順を固定する。' },
    { key: '古文', uni: /古文/, tracks: ['kobun', 'koten'], stage: ['know'], book: /古文|単語|文法|敬語|読解/,
      tip: '古文は単語と文法を先に固めないと、読解演習の効率が上がらない。単語 300 語程度と助動詞・敬語を短期間で通してから読解に入る。' },
    { key: '漢文', uni: /漢文/, tracks: ['kanbun'], stage: ['know'], book: /漢文|句法/,
      tip: '句法と重要語は量が少なく、短期間で得点源にできる。独立問題として出るのか古文との融合なのかで必要量が変わる。' },
    { key: '和歌・古文常識', uni: /和歌|古文常識|王朝|物語/, tracks: ['kobun', 'koten'], stage: [], book: /和歌|常識|文学史/,
      tip: '和歌の修辞と当時の生活・官職の知識は、本文中で説明されないまま前提にされる。読解書とは別に一度まとめて入れておく。' },
    { key: '文学史', uni: /文学史/, stage: [], book: /文学史|常識/,
      tip: '出題されるなら配点は小さいが、対策の有無で差が付きやすい。作品と成立年代・ジャンルの対応だけを一覧で覚える。' },
    { key: '漢字・語彙', uni: /漢字|語彙/, tracks: ['gendai'], stage: [], book: /漢字|語彙|キーワード/,
      tip: '現代文の語彙は読解の速度にも効く。漢字と評論用語を別冊で用意し、毎日少量ずつ進める。' },
    { key: '評論の抽象度', uni: /抽象|評論|哲学|思想/, tracks: ['gendai'], stage: ['std', 'intro'], book: /評論|読解|講義|実況/,
      tip: '抽象度の高い評論は、語彙不足と論理の追えなさが同時に効いて崩れる。設問を解く前に、段落ごとの要点を一言でまとめる練習を挟む。' },
    { key: 'マーク式・共通テスト', uni: /マーク|共通テスト|共テ/, stage: ['kyotest'], book: /共通テスト|マーク|センター/,
      tip: '選択肢の切り方には型がある。本文の根拠と選択肢の言い換えを一対一で対応させる読み方を、解説の詳しい問題集で身につける。' },
  ],

  math: [
    { key: '記述・証明', uni: /記述|証明|論証|答案/, stage: ['adv'], book: /記述|証明|論証/,
      tip: '答案の書き方まで採点される。解けたかどうかで止めず、模範解答と自分の答案を論理の飛びで比べる。添削を受けられる環境があると速い。' },
    { key: '処理速度・計算量', uni: /時間が厳しい|処理速度|計算量|スピード|時間との|計算が重い|分量/, stage: ['calc'], book: /計算/,
      tip: '発想ではなく計算で落とす失点は、専用の練習でしか減らない。式変形の手数を減らす型を覚え、時間を計って解く。' },
    { key: '発想力・難問', uni: /発想|難問|最難関|やや難|誘導がな|誘導のな/, stage: [], book: /応用|難関|思考|発想/,
      tip: '誘導が少ない問題は、解法の暗記だけでは手が出ない。1 問に時間をかけて考え切る演習を週に数問だけ入れる。' },
    { key: '頻出分野', uni: /整数|確率|微積|微分積分|図形|ベクトル|数列|複素数/, stage: ['field'], book: /整数|確率|微積|図形|ベクトル|分野/,
      tip: '頻出分野が偏っている場合、その分野だけを扱う本で先に密度を上げると効率がよい。ただし他分野を捨てる根拠にはしない。' },
    { key: 'マーク式・穴埋め', uni: /マーク|穴埋め|空欄/, stage: ['kyotest'], book: /共通テスト|マーク|センター/,
      tip: '誘導に乗る速さがそのまま得点になる。設問の流れから次に何を出させたいかを読む練習を、形式のそろった問題集で行う。' },
    { key: '標準問題の完成度', uni: /標準|基礎|典型|取りこぼ|正確/, stage: ['core'], book: /網羅|基礎|標準|精講/,
      tip: '難問より、典型問題を落とさないことで差が付く形式。網羅系を 1 冊決め、解法を再現できるかで周回する。' },
  ],

  science: [
    { key: '論述・考察', uni: /論述|考察|字程度|字前後/, stage: ['adv'], book: /論述|考察|思考/,
      tip: '知識を書き出すだけでは点にならない。実験設定から結論までの筋道を、決められた字数で書く練習を別に取る。' },
    { key: '構造決定・有機', uni: /構造決定|有機/, tracks: ['kagaku'], stage: [], book: /有機|構造決定|化学/,
      tip: '構造決定は手順が決まっているので、演習量がそのまま速度になる。官能基の検出反応と、分子式からの不飽和度の計算を反射で出せるようにする。' },
    { key: '計算量', uni: /計算/, stage: [], book: /計算/,
      tip: '設定を読み違えなければ解ける計算で落とすのが最も痛い。途中式を残す形で解き、どこで間違えたかを毎回記録する。' },
    { key: '実験・データ読解', uni: /実験|グラフ|描図|データ|図表|資料/, stage: [], book: /実験|考察|資料|図録|図説/,
      tip: '初見の実験データを読ませる出題は、知識量ではなく処理の型で差が付く。図表から読み取れることと、そこから推測したことを分けて書く。' },
    { key: '知識・正誤', uni: /知識|一問一答|正誤|暗記/, stage: ['know'], book: /知識|一問一答|図録|図説|用語/,
      tip: '知識問題の比重が高い場合、図録・資料集を演習と並行して引く習慣が効く。用語の丸暗記ではなく、図と一緒に覚える。' },
    { key: '時間配分', uni: /2科目|2 科目|時間配分|分で2|時間との/, stage: ['kako'], book: /実戦|過去問/,
      tip: '2 科目まとめて時間が与えられる形式では、科目ごとの持ち時間を自分で決める必要がある。時間を計った通し演習で配分を先に固定する。' },
  ],

  social: [
    { key: '論述', uni: /論述|字論述|字前後|大論述|字程度/, stage: ['adv'], book: /論述|記述/,
      tip: '論述は書いた量ではなく、設問の条件に答えているかで採点される。答案を第三者に見てもらう手段を確保してから演習量を増やす。' },
    { key: '史料・資料の読み取り', uni: /史料|資料|統計|地図|グラフ|図表|読図/, stage: ['shiryo'], book: /資料|史料|図説|統計|地図/,
      tip: '資料集は「読むもの」ではなく「引くもの」として使う。演習で出た資料を必ず資料集で確認する往復を習慣にする。' },
    { key: '用語・一問一答', uni: /一問一答|用語|語句|暗記|正確な漢字|漢字表記/, stage: ['know'], book: /一問一答|用語|暗記/,
      tip: '用語の精度が直接得点になる形式。書いて答える出題があるなら、読めるだけでなく漢字で書けるところまで詰める。' },
    { key: '通史・因果の理解', uni: /通史|流れ|因果|背景|テーマ史/, stage: ['intro', 'text'], book: /講義|実況|通史|教科書|流れ/,
      tip: '用語を先に詰めても、因果がつながっていないと論述にも正誤判定にも使えない。講義系で流れを通してから暗記に入る。' },
    { key: '文化史', uni: /文化史/, stage: [], book: /文化/,
      tip: '文化史は後回しにされやすく、そのまま失点になりやすい分野。通史とは別に時間を取って一気に片付ける。' },
    { key: '正誤判定', uni: /正誤/, stage: [], book: /正誤/,
      tip: '正誤問題は、誤りの作り方（時期のずれ・主体の入れ替え・因果の逆転）に型がある。解説の詳しい問題集で型ごとに潰す。' },
    { key: 'マーク式・共通テスト', uni: /マーク|共通テスト|共テ/, stage: ['kyotest'], book: /共通テスト|マーク|センター/,
      tip: '資料の読み取りに比重が移った形式なので、知識だけでは頭打ちになる。時間を計った演習で処理速度を上げる。' },
  ],
};

/**
 * その大学の出題説明に当たった特徴を返す。
 * **当たらなければ空配列を返す。** 埋め合わせに一般論を足さない。
 */
export function matchFeatures(subDir, text) {
  const table = FEATURES[subDir] || [];
  return table.filter(f => f.uni.test(text));
}

/* ============================================================
   おすすめの参考書
   ============================================================ */

/** 志望レベルごとに、`BOOKS[].unis` のどのタグを「この層向け」とみなすか */
const TIER_TAGS = {
  kyote:     ['共テ利用', '共通テスト', '共通テスト全般', '私大共テ利用', '国公立全般'],
  nikkoma:   ['日東駒専', '産近甲龍', '成成明学', '私大文系'],
  march:     ['GMARCH', 'GMARCH上位', 'GMARCH理系', 'MARCH', '関関同立', '立教'],
  chikoku:   ['地方国公立', '地方国公立上位', '地方国公立文系', '国公立全般', '千葉大'],
  sokei:     ['早慶', '早慶上理', '早慶文系', '早慶理系', '早慶下位学部', '早稲田', '慶應', '上智', 'ICU', '上理', '東京理科大', '理科大'],
  kyutei:    ['旧帝', '旧帝文系', '旧帝理系', '地方旧帝', '難関国公立', '国公立全般'],
  top:       ['東大', '京大', '東大京大', '一橋', '東京科学大', '東工大', '難関国公立'],
  med:       ['国公立医', '旧帝医', '地方国公立医', '難関国公立医', '医学部', '医学部医学科', '医学部併願'],
  shiritsui: ['私立医大', '私立医', '医学部', '医学部医学科', '医学部併願'],
  hitotsubashi: ['一橋', '難関国公立', '旧帝'],
};

/** 医学部向けの本を効かせてよい志望レベル */
const MED_TIERS = new Set(['med', 'shiritsui']);

/* タグの分け方は書籍ページの「あとに進む本」と共用する（build/lib/unitags.mjs） */

/**
 * この大学を名指ししているタグか。
 * **部分一致では見ない。** 別名トークンの完全一致か、大学名の前方一致だけ。
 * 部分一致にすると「京大」が「東京大学」に当たり、東大のページに京大向けの本が並ぶ。
 */
function namesUniversity(part, ctx) {
  const core = part.replace(/(理系|文系|医学科|医)$/, '') || part;
  if (core.length < 2) return false;
  return ctx.tokens.has(core) || ctx.tokens.has(part) || ctx.name.startsWith(core);
}

/**
 * 目標偏差値と本の到達目安の近さ。0〜2 点。
 * `BOOKS[].h` は到達目安ではなく所要時間なので使わない。`diff`（1〜10）を見る。
 */
function levelFit(book, targetH) {
  if (typeof targetH !== 'number' || typeof book.diff !== 'number') return 0;
  // 偏差値 45→diff 2、55→5、65→8 くらいの対応で当てる（サイト内の帯の付け方に合わせた粗い目安）
  const want = Math.max(1, Math.min(10, Math.round((targetH - 38) / 3.4)));
  const gap = Math.abs(book.diff - want);
  if (gap <= 1) return 2;
  if (gap <= 2) return 1;
  return 0;
}

/**
 * シリーズの判定に使う書名の正規形。巻・分冊・編・分野の違いを落とす。
 *
 *   物理のエッセンス 熱・電磁気・原子 / 物理のエッセンス 力学・波動 → 物理のエッセンス
 *   名問の森 力学・熱・波動I / 名問の森 波動II・電磁気・原子       → 名問の森
 *   実況中継① / 実況中継②                                     → 実況中継
 *
 * 2026-09-10 まで大学別ページのおすすめに「物理のエッセンス 熱・電磁気・原子」だけが
 * 並び、力学編が無いという並びが出ていた。同じシリーズからはルート上で先に来る 1 冊だけを
 * 候補に残すために使う。
 *
 * **数字は単独の 1 桁（巻数）だけを落とす。** ターゲット1400 / 1900、解釈の技術70 / 100 の
 * ような数字は別の本を表すので残す。「上・中・下」も末尾の巻表記だけを落とす
 * （「上級編」「中学」の上・中まで消すと別の書名が同じになる）。
 */
export function seriesKey(name) {
  return String(name || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, '')
    .replace(/(必修編|難関大編|入門編|基礎編|発展編|標準編|応用編)/g, '')
    .replace(/(II・B・C|III・C|I・A|IIIC|IIB|IA)/g, '')
    .replace(/(力学|熱|波動|電磁気|原子)/g, '')
    .replace(/(?<![A-Za-z])(III|II|I|Ⅲ|Ⅱ|Ⅰ)(?![A-Za-z])/g, '')
    .replace(/(?<![0-9０-９])[1-9１-９](?![0-9０-９])/g, '')
    .replace(/\s[上中下]巻?$/, '')
    .replace(/[・\s　]+/g, '')
    .trim();
}

/**
 * おすすめの 1 周目で重複を避ける単位。役割の近い段をまとめる。
 * 例: 英語の単語と熟語はどちらも「語彙」。単語帳と熟語帳だけで枠を 2 つ使わない。
 * 書いていない段はその段だけで 1 グループ。
 */
export const STAGE_GROUPS = {
  english:  { tango: 'vocab', jukugo: 'vocab', kaishaku: 'read', chobun: 'read' },
  math:     { core: 'typical', std: 'typical' },
  japanese: { core: 'drill', std: 'drill' },
  science:  { core: 'drill', std: 'drill' },
  social:   { intro: 'flow', text: 'flow', core: 'drill', std: 'drill' },
};

const stageGroup = (dir, stage) => ((STAGE_GROUPS[dir] || {})[stage]) || stage;

/** ルート上の位置。小さいほど先に来る（lvl → 本編配列の index） */
const LAST = { lvl: 99, idx: 99 };
const posLess = (a, b) => a.lvl - b.lvl || a.idx - b.idx;

/**
 * その大学におすすめの参考書を選ぶ。
 *
 * @param {object} o.d        科目データ（loadSubjectData の戻り）
 * @param {object} o.uni      universities.json の 1 行
 * @param {string} o.tierId   志望レベル
 * @param {string[]} o.tracks 使うトラック（選べない科目は呼び出し側で外しておく）
 * @param {object[]} o.features matchFeatures の結果
 * @param {boolean} o.isMed   この大学に医学部があるか
 * @param {number} o.max      何冊まで出すか
 * @returns {{book:object, tracks:string[], role:string, note:string, reasons:string[], score:number}[]}
 */
export function recommendBooks(o) {
  const { d, uni, tierId, tracks, features, isMed, max = 6 } = o;
  const node = d.routes[tierId] || {};
  const bookById = new Map(d.books.map(b => [b.id, b]));

  const tokens = new Set([uni.n, ...String(uni.a || '').split(/\s+/).filter(Boolean)]);
  const ctx = { tokens, name: uni.n };
  const tierTags = new Set(TIER_TAGS[tierId] || []);

  /* 候補を集める。ルート本編の本と、その代替候補（alts）の両方を見る。
     代替候補まで見るのは、大学ごとの出題に噛み合う本がそこに入っているため
     （自由英作文が出る大学に対する「最難関大の英作文」など）。 */
  const cand = new Map();   // id → {book, tracks:Set, role, note, isAlt, pos}
  const addCand = (id, track, role, note, isAlt, pos = LAST) => {
    const b = bookById.get(id);
    if (!b || b.recordType === 'routePlaceholder') return;
    const cur = cand.get(id);
    if (cur) {
      if (posLess(pos, cur.pos) < 0) cur.pos = pos;
      /* 同じ本が文系と理系の両方に載っていることがある。トラックは足していく。
         先に見たほうだけを表示すると、理系ルートにも入っている本に「文系」とだけ
         書かれることになり、理系の読者がその本を自分向けでないと読み飛ばす */
      if (track) cur.tracks.add(track);
      if (!cur.role && role) cur.role = role;
      if (!cur.note && note) cur.note = note;
      if (cur.isAlt && !isAlt) cur.isAlt = false;
      return;
    }
    cand.set(id, { book: b, tracks: new Set(track ? [track] : []), role: role || '', note: note || '', isAlt, focus: null, pos });
  };
  for (const track of tracks) {
    const v = node[track];
    if (!v) continue;
    const steps = Array.isArray(v) ? v : (v.omni || v.quick || []);
    steps.forEach((s, idx) => {
      const pos = { lvl: typeof s.lvl === 'number' ? s.lvl : LAST.lvl, idx };
      addCand(s.id, track, s.role || '', s.note || '', false, pos);
      for (const a of s.alts || []) addCand(a, track, s.role || '', '', true, pos);
    });
  }
  /* 並行して進める本（para）も候補に入れる。単語・熟語・リスニングはここに置かれていて、
     本編だけを見ると語彙の本が 1 冊も出ない志望レベルがある */
  const para = node.para;
  if (para) {
    const lists = Array.isArray(para) ? { '*': para } : para;
    for (const k of Object.keys(lists)) {
      if (!Array.isArray(lists[k])) continue;
      if (k !== '*' && tracks.length && !tracks.includes(k)) continue;
      for (const s of lists[k]) addCand(s.id, k === '*' ? '' : k, s.role || '', s.note || '', false);
    }
  }

  /* 出題形式別の重点対策（data/subjects/<科目>/focus.json）も候補に入れる。
     ルートの本編・代替・並行枠だけだと、早稲田のように「自由英作文」「超長文」を問う大学でも
     英作文・超長文の本が 1 冊も候補に上がらない（2026-09-10 まで）。
     引く形式は、大学の fx（データに書いてある重点対策）と、出題説明から当たった特徴のうち
     focus に同じ名前があるもの。どちらもデータにある語だけで、推測は足さない */
  const focus = d.focus || {};
  const focusKeys = [...new Set([
    ...(uni.fx || []),
    ...features.map(f => f.key).filter(k => focus[k]),
  ])];
  for (const key of focusKeys) {
    const f = focus[key];
    if (!f) continue;
    const mark = (id, main) => {
      addCand(id, '', '', main ? f.note : '', !main);
      const c = cand.get(id);
      if (!c) return;
      // 同じ本が複数の形式に当たるときは、本編として当たった形式を優先する
      if (!c.focus || (main && !c.focus.main)) c.focus = { key, main };
    };
    mark(f.id, true);
    for (const a of f.alts || []) mark(a, false);
  }

  /* 同じシリーズの巻が複数あるときは、ルート上で先に来る 1 冊だけを残す。
     「エッセンスの熱編だけ」「実況中継の③だけ」のような、途中の巻から始まる並びを出さない */
  const bySeries = new Map();
  for (const c of cand.values()) {
    const k = seriesKey(c.book.name);
    const cur = bySeries.get(k);
    if (!cur || posLess(c.pos, cur.pos) < 0
      || (!posLess(c.pos, cur.pos) && c.book.id.localeCompare(cur.book.id) < 0)) bySeries.set(k, c);
  }
  const kept = new Set([...bySeries.values()]);

  const scored = [];
  for (const c of cand.values()) {
    if (!kept.has(c)) continue;
    const b = c.book;
    const hay = `${b.name} ${b.official || ''} ${b.style || ''} ${b.subjects || ''} ${c.role} ${c.note}`;
    let score = 0;
    const reasons = [];

    /* 1. この大学を名指ししているタグ */
    let named = '';
    for (const raw of b.unis || []) {
      for (const part of tagParts(raw)) {
        if (!namesUniversity(part, ctx)) continue;
        // 医学部向けの本は、医学部のある大学にだけ効かせる
        if (/医/.test(part) && !isMed) continue;
        named = part;
      }
    }
    if (named) { score += 9; reasons.push(`${named}向けとして収録`); }

    /* 2. 志望レベルのタグ */
    if (!named) {
      for (const raw of b.unis || []) {
        for (const part of tagParts(raw)) {
          if (tierTags.has(part)) { score += 5; reasons.push(`${part}の対策として収録`); break; }
        }
        if (reasons.length) break;
      }
    }

    /* 3. 医学部向けのタグ（医学部のある大学で、志望レベルが医のときだけ） */
    if (isMed && MED_TIERS.has(tierId) && !named) {
      const medTag = (b.unis || []).find(t => /医/.test(t));
      if (medTag) { score += 4; if (!reasons.some(r => /医/.test(r))) reasons.push(`${medTag}向けとして収録`); }
    }

    /* 4. 出題の特徴との噛み合い。最大 3 件まで数える */
    let hit = 0;
    for (const f of features) {
      if (hit >= 3) break;
      // 分野が指定されている特徴は、その分野のトラックに載っている本にしか当てない
      if (f.tracks && f.tracks.length && ![...c.tracks].some(t => f.tracks.includes(t))) continue;
      const byStage = f.stage.includes(b.stage);
      const byText = f.book.test(hay);
      if (!byStage && !byText) continue;
      hit++;
      score += 4;
      reasons.push(`「${f.key}」に対応`);
    }

    /* 5. 出題形式別の重点対策の本。本編 +7、代替 +4 */
    if (c.focus) {
      score += c.focus.main ? 7 : 4;
      reasons.push(`「${c.focus.key}」対策として`);
    }

    /* 6. ルート本編の本を、代替候補より上に置く */
    if (!c.isAlt) score += 2;

    /* 7. 目標偏差値との距離 */
    score += levelFit(b, uni.h);

    // ルートに載っていない重点対策の本は、ルート上の役割の代わりに「重点:形式」を出す
    const role = c.role || (c.focus ? `重点:${c.focus.key}` : '');
    scored.push({ ...c, role, tracks: [...c.tracks], score, reasons });
  }

  /* 同点ならルート上で先に来る本を上に置く（土台の本が先に来る）。その次に難易度 */
  scored.sort((x, y) => y.score - x.score
    || posLess(x.pos, y.pos)
    || (x.book.diff || 0) - (y.book.diff || 0)
    || x.book.id.localeCompare(y.book.id));

  /* 役割のグループ（STAGE_GROUPS）が重ならないように取る（単語と熟語だけで枠を埋める、
     のような並びを避ける）。足りなければ 2 周目で埋める */
  const out = [];
  const usedStage = new Set();
  for (const s of scored) {
    if (out.length >= max) break;
    const g = stageGroup(d.dir, s.book.stage);
    if (usedStage.has(g)) continue;
    usedStage.add(g);
    out.push(s);
  }
  for (const s of scored) {
    if (out.length >= max) break;
    if (out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

/* ============================================================
   選べる科目（トラックの絞り込み）
   ============================================================ */

/**
 * その大学で選べる科目だけにトラックを絞る。
 *
 * 値の意味は各科目の診断（assets/js/subject-*.js の resolveUni）と同じ。
 *   0 … 出題されない／選べない   1 … 選べる   2 … 学部・方式による
 *
 * @returns {{keep:string[], limited:string[]}} keep=残すトラック / limited=「学部・方式による」もの
 */
export function availableTracks(subDir, uni, trackKeys) {
  const map = {
    japanese: { gendai: 1, kobun: uni.k, kanbun: uni.kan },
    science:  { butsuri: uni.p, kagaku: uni.c, seibutsu: uni.b, chigaku: uni.g },
    social:   { nihonshi: uni.nihonshi, sekaishi: uni.sekaishi, chiri: uni.chiri,
                kokyo: uni.kokyo, seikei: uni.seikei, rinri: uni.rinri },
  }[subDir];
  if (!map) return { keep: trackKeys.slice(), limited: [] };

  const keep = [];
  const limited = [];
  for (const k of trackKeys) {
    const v = map[k];
    if (v === undefined) { keep.push(k); continue; }   // 表に無いトラックは触らない
    if (v === 0) continue;
    keep.push(k);
    if (v === 2) limited.push(k);
  }
  // 全部落ちたら（個別試験にその科目が無い大学）、元の並びに戻す。
  // 空にすると参考書が 1 冊も出ず、共通テストだけ必要な人に何も示せない
  return { keep: keep.length ? keep : trackKeys.slice(), limited };
}
