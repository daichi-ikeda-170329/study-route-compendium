/**
 * english 科目トップの描画・操作コード。**手で編集してよい。**
 *
 * もとは english/index.html のインライン <script> にデータごと入っていた。
 * インラインのままだと HTML の解析が止まり、理科では LCP が 10 秒台になっていた。
 * build/migrate-subject.mjs が、中身を書き換えずにここへ切り出した。
 *
 * データ（BOOKS / UNIS / TIERS / ROUTES / GUIDES / STAGES / CONFIG）はここには無い。
 * 正本は data/subjects/english/ で、配信用は assets/generated/subjects/english.*.json。
 * assets/js/subject-loader.js が取得して RT_SUBJECT_APP(DATA) を呼ぶ。
 *
 * **トップレベルの function は window へ載せ直している。**
 * HTML の onclick="go('catalog')" などがこれらを呼ぶため。
 */
window.RT_SUBJECT_APP = function (DATA) {
var CONFIG = DATA.config;
var STAGES = DATA.stages;
var ROUTES = DATA.routes;
var TIERS  = DATA.tiers;
var GUIDES = DATA.guides;
var UNIS   = DATA.unis;
var BOOKS  = DATA.books;

/* 共通スクリプトのグローバルを window から受け取る（自動生成）。
   これが無いと下の `var X = (typeof X !== "undefined" && X) || …` が
   関数スコープの undefined を見て、本物ではなく no-op を選んでしまう。 */
var RTShare = window.RTShare;
var RTPace = window.RTPace;
/* HTML のインライン属性（onclick="go('catalog')" など）から呼ばれる名前を window へ載せ直す。
   function 宣言は巻き上げ済みなので本体より先に載せられる。本体の途中で例外が出ても
   画面の操作が死なないよう、あえてここで載せる。以下は自動生成。 */
window.isProv = isProv; window.provLast = provLast; window.hRange = hRange; window.byDiffAsc = byDiffAsc; window.byDiffDesc = byDiffDesc; window.diffColor = diffColor; window.isbn10Of = isbn10Of; window.normQ = normQ; window.searchUnis = searchUnis; window.isMed = isMed; window.resolveUni = resolveUni; window.pickBunri = pickBunri; window.bookLv = bookLv; window.levelFromHen = levelFromHen; window.levelFromDone = levelFromDone; window.moshiComparable = moshiComparable; window.recalcStatus = recalcStatus; window.targetHen = targetHen; window.renderVerdict = renderVerdict; window.go = go; window.syncHash = syncHash; window.applyHash = applyHash; window.coverSrcs = coverSrcs; window.amazonURL = amazonURL; window.rakutenURL = rakutenURL; window.coverHTML = coverHTML; window.covLoad = covLoad; window.covErr = covErr; window.buildFilters = buildFilters; window.setFilter = setFilter; window.bookCardHTML = bookCardHTML; window.renderCatalog = renderCatalog; window.findConnections = findConnections; window.openModal = openModal; window.closeModal = closeModal; window.buildRoutePicker = buildRoutePicker; window.buildSenseiPicker = buildSenseiPicker; window.selectTier = selectTier; window.selectSensei = selectSensei; window.syncMode = syncMode; window.setMode = setMode; window.sugSync = sugSync; window.sugClose = sugClose; window.renderUniSug = renderUniSug; window.pickUni = pickUni; window.applyUni = applyUni; window.renderDoneSug = renderDoneSug; window.addDone = addDone; window.removeDone = removeDone; window.renderDoneChips = renderDoneChips; window.segAria = segAria; window.wireSeg = wireSeg; window.routeEmptyHTML = routeEmptyHTML; window.climbNodeHTML = climbNodeHTML; window.paraNodeHTML = paraNodeHTML; window.renderRoute = renderRoute; window.renderRouteBody = renderRouteBody; window.renderHome = renderHome; window.startQuiz = startQuiz; window.activeQuizSteps = activeQuizSteps; window.renderQuiz = renderQuiz; window.pickOpt = pickOpt; window.nextQuiz = nextQuiz; window.focusResult = focusResult; window.renderQuizResult = renderQuizResult; window.applyQuiz = applyQuiz; window.renderGuide = renderGuide; window.toggleGuide = toggleGuide; window.trapFocusables = trapFocusables; window.modalOpened = modalOpened; window.modalClosed = modalClosed; window.openBox = openBox; window.syncRouteSegs = syncRouteSegs; window.applySharedUni = applySharedUni; window.sharedUniName = sharedUniName;


/* 診断結果の共有・保存（assets/js/share.js）。
   スクリプトを読めなかった場合でも診断が壊れないよう、何もしない実装で代替する。 */
var RTShare = (typeof RTShare !== "undefined" && RTShare) || {setup(){}, beforeQuiz:()=>"", beforeResult:()=>"", afterResult:()=>"", routeBlock:()=>"", restart(){ startQuiz(); go("quiz"); }};
/* ルートの進めるペース（assets/js/pace.js）。同じく、読めなくてもルートは出す */
var RTPace = (typeof RTPace !== "undefined" && RTPace) || {setup(){}, apply(){}};


/* 設定（CONFIG）は data/subjects/english/config.json が正本。
   ここでは DATA.config として受け取る。 */


/* アフィリエイト ID が未設定のうちは、広告表記を一切出さない（未参加の状態で
   参加者の表記を出さないため）。CONFIG に ID を入れると、PR バー・広告注記・
   法定表記・rel="sponsored" が自動で戻る。 */
/* 広告リンクかどうかは販売サイトごとに違う。ID が入っている側だけが広告リンクで、
   もう一方はタグ無しの通常リンク（紹介料が発生しない）。未参加のプログラムを
   名指ししないよう、法定表記の文言もここから組み立てる。 */
const AFF_AZ = Boolean(CONFIG.amazonTag);
const AFF_RK = Boolean(CONFIG.rakutenId);
const AFF    = AFF_AZ || AFF_RK;

/* Google AdSense。ID が入るまで広告も広告の表記も出さない */
const ADSENSE = Boolean(CONFIG.adsenseId);

const AFF_PROGRAMS = [
  AFF_AZ ? "Amazonアソシエイト・プログラム" : null,
  AFF_RK ? "楽天アフィリエイト" : null
].filter(Boolean).join("および");

/* 広告リンクになる販売サイトの表示名 */
const AFF_STORES = [
  AFF_AZ ? "Amazon" : null,
  AFF_RK ? "楽天ブックス" : null
].filter(Boolean).join("・");
/* 表記は静的に置いてある。ID が未設定のときだけ取り除く（描画のズレを起こさないため） */
if (!AFF && !ADSENSE) document.getElementById("prBar")?.remove();
/* ============================================================
   DATA — 高校英語 参考書データベース(2026)
   ISBNは出版社/書店DBで確認した最新版。表紙は書店DBの画像を使用し、
   取得できない場合は自動でプレースホルダー表紙に切替。
   diff: 体感難易度 1–10 / h: 完走の目安時間(概算)
   ============================================================ */

/* ============================================================
   新刊（評価が未了の本）
   ============================================================
   現物を読んでいないので難易度・到達目安・強み・注意点・向いている人を持たない。
   数字を作らず「評価準備中」と出す。生成側は build/lib/newbooks.mjs が同じ判定を
   持っているので、文言を変えるときは両方を直す。設計は docs/new-books-plan.md。

   diff を持たない本は 3 通りの壊れ方をする。
     1. ${b.diff} の素の埋め込み        → 画面に undefined が出る
     2. b.pros.map / b.subjects.split → TypeError で描画そのものが止まる
     3. d<=2 ? … : 最難関 形の分類     → 比較が全部 false になり最難関に化ける
   3 は静かに間違うので最も危ない。 */
const PROV_LABEL = "新刊・評価準備中";
function isProv(b){ return !!b && b.provisional === true; }
/* 難易度順の並びで末尾へ落とす。diff の無い本を a.diff-b.diff に通すと NaN になり、
   比較子が非対称になって並び順が実行ごとに変わる */
function provLast(a,b){ return (isProv(a)?1:0) - (isProv(b)?1:0); }
/* 難易度の並び順。diff（1〜10）が同じ本は目安偏差値（下限→上限→書名）で細かく並べる。
   diff だけで並べると、同じ diff の中で「40〜55 → 〜48 → 35〜50」のように偏差値が
   前後して、画面では難易度順に見えない。生成側は build/lib/rank.mjs が同じ処理を持つ。 */
/* 目安偏差値の [下限, 上限]。「45〜60」「〜50(導入)」「68〜」「50〜75(3段階)」を拾う。
   「共テ7割〜9割」「東大合格レベル」のように偏差値で書いていない本は [999,999] を
   返し、同じ難易度の中では数値で書いてある本のうしろへまとめる（混ぜると、得点率の
   数字が偏差値として並んでしまう）。 */
function hRange(b){
  const s = String((b && b.hensachi) || "");
  const nums = (s.match(/\d{2}/g) || []).map(Number).filter(n => n >= 25 && n <= 85);
  if(!nums.length) return [999, 999];
  return [/^\s*[〜~]/.test(s) ? 0 : nums[0], nums[nums.length - 1]];
}
/* 評価未了（diff を持たない）本は常に末尾。昇順・降順のどちらでも末尾に置く */
function byDiffAsc(a,b){
  return provLast(a,b) || (a.diff||0)-(b.diff||0)
    || hRange(a)[0]-hRange(b)[0] || hRange(a)[1]-hRange(b)[1]
    || String(a.name).localeCompare(String(b.name),"ja");
}
/* 降順でも、評価未了の本と偏差値を書いていない本は末尾に置く
   （[999,999] をそのまま降順に通すと先頭へ出てしまう） */
function byDiffDesc(a,b){
  const ra = hRange(a), rb = hRange(b), unknown = r => (r[0]===999 ? 1 : 0);
  return provLast(a,b) || (b.diff||0)-(a.diff||0)
    || unknown(ra)-unknown(rb) || rb[0]-ra[0] || rb[1]-ra[1]
    || String(a.name).localeCompare(String(b.name),"ja");
}
function diffColor(d){
  if(d==null) return "var(--line)";   /* 新刊は難易度を持たない。色も付けない */
  if(d<=2) return "#2F8659";
  if(d<=4) return "#2E7D9A";
  if(d<=6) return "#24427C";
  if(d<=7) return "#5B4E9E";
  if(d<=8) return "#B5432A";
  return "#8C2437";
}



/* ADDED BOOKS — 未掲載参考書の追加登録分。ここから下も BOOKS の一部として扱う */

/* /ADDED BOOKS */

/* ============================================================
   UNIVERSITIES — 志望校入力用データベース
   [名称, 検索エイリアス, ルートtier, 設置, 英語の到達目安(全統記述), 英語の出題傾向, 重点対策分野]
   ============================================================ */


/* ============================================================
   GUIDES — オリジナル学習ガイド記事
   ============================================================ */


/* ============================================================
   LEGAL — 法定表記・ポリシー
   ============================================================ */
/* サイトの表記（運営者情報・データの作り方・プライバシーポリシー・免責事項・
   広告について）は /about/ /methodology/ /privacy/ /disclaimer/ /ads/ の静的
   ページが正本。以前はここに JS のモーダルとして持っていたが、クローラー・
   AdSense の審査・JS を切った環境からは存在しないのと同じだったため、
   フッターから静的ページへ送る形にした。
   本文の正本は build/content/legal.mjs（node build/generate-legal.mjs で生成）。 */
/* ============================================================
   TIERS & ROUTES — 志望レベル×受験タイプ×方針
   bun=国公立二次型(記述) / ri=私立個別型(マーク)
   lvl: 0 導入 / 1 基礎 / 2 標準 / 3 応用 / 4 過去問
   ============================================================ */



/* 共テ・中堅私大は受験タイプ共通/私大型・国公立型の別名を補完 */








/* 私立医学部ルート */




/* ============================================================
   SENSEI ROUTES — 講師ルート(単語〜過去問まで一気通貫)
   ============================================================ */
const SENSEIS = [
{id:"seki",name:"関正生ルート",kana:"せき まさお",tag:"スタディサプリ",color:"#B5432A",
 sub:"ポラリス&The Rulesの2本柱",
 desc:"「丸暗記を排して核心から理解する」解説で絶大な支持を集める人気講師。文法(ポラリス)→解釈(解釈ポラリス)→長文(The Rules)→英作文(英作文ポラリス)まで自著だけで最難関レベルへ一気通貫できる。単語はStock、知識問題は頻出問題ポラリスが対応。",
 lack:"熟語専用帳はなし(頻出問題ポラリスで代用)。共テ専用対策は他講師の本を併用可。",
 seq:[
  {id:"shin-taizen",role:"文法講義",lvl:0,note:"核心からの理解。通期の辞書兼読み物に",alts:["polaris-b0"]},
  {id:"polaris-b1",role:"文法演習",lvl:1,note:"精選過去問で文法を装備",alts:["polaris-b0"]},
  {id:"polaris-b2",role:"文法強化",lvl:1,note:"MARCH〜国公立レベルの文法へ",alts:["final-polaris","polaris-b3"]},
  {id:"kaishaku-polaris1",role:"解釈",lvl:2,note:"過去問英文で構文把握を訓練",alts:["sekaiichi-dokkai","essentials100"]},
  {id:"rules1",role:"長文",lvl:2,note:"読解ルール84を装備",alts:["cho-polaris0"]},
  {id:"rules2",role:"長文",lvl:2,note:"共テ〜中堅レベルでルールを運用",alts:["cho-polaris1"]},
  {id:"rules3",role:"長文強化",lvl:2,note:"MARCH・国公立レベルの主軸",alts:["cho-polaris2"]},
  {id:"rules4",role:"最難関長文",lvl:3,note:"早慶・旧帝レベルの総仕上げ",alts:["cho-polaris3","essentials-max"]},
  {id:"eisaku-polaris1",role:"英作文",lvl:3,note:"国公立・英作文が出る大学はここまで",alts:["eisaku-polaris2","sekaiichi-eisaku"]},
  {id:"akahon",role:"過去問",lvl:4,note:"早慶は「世界一わかりやすい」シリーズも",alts:["sekaiichi-waseda","sekaiichi-keio","todai-kakushin"]}
 ],
 para:[
  {id:"stock4500",note:"記憶ブースターで単語を並行(基礎はStock3000)"},
  {id:"hinshutsu-polaris",note:"熟語・語彙・会話の知識問題を担当"},
  {id:"lis-platinum",note:"リスニングは先読み技術から"}
 ]},
{id:"takeoka",name:"竹岡広信ルート",kana:"たけおか ひろのぶ",tag:"駿台・学研プライムゼミ",color:"#18305E",
 sub:"精読と英作文の最高峰",
 desc:"『ドラゴン桜』のモデルとして知られる英語指導の重鎮。LEAP(単語)→ULTIMATE(文法)→入門英文問題精講・英文熟考(解釈)→SUPREMACY(長文)→ドラゴン・イングリッシュ&面白いほど(英作文)と、精読・英作文を軸に国公立最難関へ向かう硬派な道。共テはR/L「面白いほど」が担当。",
 lack:"レベル別の長文シリーズはないため、演習量はやっておきたい等で補完を推奨。",
 seq:[
  {id:"nyumon-eibun",role:"解釈入門",lvl:0,note:"全題講義動画つき。文法既習ならここから",alts:["gijutsu70"]},
  {id:"ultimate600",role:"文法演習",lvl:1,note:"精選600題で文法を実戦レベルに",alts:["nextstage"]},
  {id:"jukou-jo",role:"解釈",lvl:2,note:"音声講義で構造把握を深める",alts:["gensoku125"]},
  {id:"jukou-ge",role:"解釈強化",lvl:2,note:"難構文の和訳へ対応",alts:["toshizu"]},
  {id:"dragon100",role:"英作文(暗唱)",lvl:2,note:"基本100文を先に仕込む",alts:["yokubari"]},
  {id:"supremacy",role:"長文",lvl:3,note:"至高の20題を徹底精読",alts:["yatte700"]},
  {id:"takeoka-omoshiro",role:"英作文",lvl:3,note:"原則70で入試英作文を完成",alts:["kiso-eisaku","yokubari"]},
  {id:"akahon",role:"過去問",lvl:4,note:"東大志望は25カ年+要約UNLIMITED(竹岡編)",alts:["todai25","todai-yoyaku","yoshi-yoyaku"]}
 ],
 para:[
  {id:"leap",note:"発信できる単語力を並行(基礎はLEAP Basic)"},
  {id:"hikkei-hyogen",note:"英作文に直結する表現集"},
  {id:"takeoka-r",note:"共テRは「面白いほど」で対策"},
  {id:"manten-kotsu",note:"共テLは満点のコツで仕上げ"}
 ]},
{id:"hijii",name:"肘井学ルート",kana:"ひじい がく",tag:"スタディサプリ",color:"#2F8659",
 sub:"ゼロから面白いほどわかる道",
 desc:"「ゼロから」「面白いほど」シリーズで、単語・文法・解釈・長文・英作文・リスニング・共テまでほぼ全分野を自著でカバーする稀有な講師。文法(ゼロから)→解釈(読解のための英文法)→長文(ソリューション)の接続は全ルート中で最も段差が小さく、独学での挫折率が低い。",
 lack:"本格的な単語帳・熟語帳はないため、シス単・ターゲット等の併用を推奨。",
 seq:[
  {id:"hijii-zero",role:"文法講義",lvl:0,note:"ゼロから講義+確認問題で土台を作る",alts:["oiwa"]},
  {id:"hijii-bunpo-sol",role:"文法演習",lvl:1,note:"薄型問題集を全問正解まで回す",alts:["hijii-zero-next"]},
  {id:"hijii-dokkai-hisshu",role:"解釈",lvl:1,note:"読解のための英文法で精読の型を",alts:["hijii-zero-chobun"]},
  {id:"solution1",role:"長文",lvl:2,note:"音読10回で1冊を完全消化",alts:["solution0"]},
  {id:"solution2",role:"長文",lvl:2,note:"MARCH・国公立レベルへ",alts:["solution-theme"]},
  {id:"hijii-dokkai-nankan",role:"解釈強化",lvl:3,note:"難関大の複雑構文に対応",alts:[]},
  {id:"solution3",role:"最難関長文",lvl:3,note:"早慶・旧帝レベルの仕上げ",alts:["solution-theme"]},
  {id:"hijii-tadashiku",role:"英作文",lvl:3,note:"国公立・記述型は英作文まで",alts:["hijii-sugu-jiyu","hijii-sakubun"]},
  {id:"akahon",role:"過去問",lvl:4,note:"共テは「きめる!」R/Lで対策",alts:["kimeru-r","kimeru-lis"]}
 ],
 para:[
  {id:"hijii-tango",note:"覚え方を学んだらシス単・ターゲット等へ接続"},
  {id:"extreme",note:"難関志望は最新テーマ語彙を上乗せ"},
  {id:"kimeru-lis",note:"共テリスニングはきめる!で"}
 ]}
];

/* ============================================================
   FOCUS — 志望校の出題傾向 → 重点対策教材
   ============================================================ */
const FOCUS = {
 "和訳":      {id:"jukou-ge",   note:"下線部和訳が頻出。構文を正確に訳文へ落とす訓練を",alts:["toshizu","gijutsu100"]},
 "英作文":    {id:"dragon100",  note:"和文英訳が出る。暗唱例文で「書ける部品」を蓄える",alts:["haitore-wabun","takeoka-omoshiro"]},
 "自由英作文":{id:"haitore-jiyu",note:"自由英作文が出る。型と頻出テーマを事前に仕込む",alts:["eisaku-polaris2","hijii-sugu-jiyu"]},
 "要約":      {id:"yoshi-yoyaku",note:"要約・大意把握が出る。専用訓練の価値が非常に高い",alts:["discourse","todai-yoyaku"]},
 "リスニング":{id:"lis-platinum",note:"リスニングが課される。毎日の音声訓練+先読み技術を",alts:["kimutatsu-basic","kimeru-lis"]},
 "超長文":    {id:"yatte1000",  note:"超長文が名物。分量への耐性と時間配分の訓練を",alts:["kimutatsu-shidai"]},
 "速読":      {id:"sokudoku-tr",note:"分量勝負の形式。WPMを計測して読速を底上げ",alts:["hyper-training","chobun-platinum"]},
 "正誤":      {id:"ryomon500",  note:"正誤問題が名物。誤文訂正の専用演習を",alts:["hinshutsu1000"]},
 "会話文":    {id:"hinshutsu-polaris",note:"会話文・口語表現が頻出。知識問題を体系的に",alts:["chobun-platinum"]},
 "語彙":      {id:"pass-jun1",  note:"語彙水準が高い。単語帳2冊目で上位語彙まで",alts:["sokutan-jokyu","teppeki"]},
 "文法":      {id:"final-polaris",note:"文法・語法の独立問題が多い。ランダム演習で仕上げを",alts:["hinshutsu1000","ryomon500"]},
 "記述":      {id:"kijutsu-tr", note:"日本語記述の比重が高い。採点基準つきの記述訓練を",alts:["canpass-e"]}
};

/* ============================================================
   QUIZ — 3分診断
   ============================================================ */
const QUIZ = [
  {q:"Q1 — 受験タイプ",title:"あなたの受験タイプは?",sub:"和訳・英作文などの記述があるかでルートが変わります",key:"bunri",
   opts:[
     {v:"bun",b:"国公立二次型(記述中心)",s:"和訳・内容説明・英作文などの記述試験がある",ic:"M4 6h16M4 12h10M4 18h7"},
     {v:"ri",b:"私立個別型(マーク中心)",s:"マーク式・共テ利用が中心で記述はほぼ無い",ic:"M5 12l4 4L19 6"}
   ]},
  {q:"Q2 — 志望レベル",title:"目指すレベルは?",sub:"迷ったら少し上を選ぶのがおすすめです",key:"tier",
   opts:[
     {v:"kyote",b:"共通テストが中心",s:"共テ利用・国公立1次を固めたい",ic:"M4 5h16v14H4zM4 10h16"},
     {v:"nikkoma",b:"日東駒専・産近甲龍",s:"中堅私大に確実に合格したい",ic:"M12 3 4 7v2h16V7l-8-4ZM5 11v7M12 11v7M19 11v7M3 20h18"},
     {v:"march",b:"MARCH・関関同立",s:"難関私大レベル",ic:"M12 3 4 7v2h16V7l-8-4ZM5 11v7M12 11v7M19 11v7M3 20h18"},
     {v:"chikoku",b:"地方国公立",s:"二次試験は標準記述型",ic:"M6 20V8l6-4 6 4v12M10 20v-6h4v6"},
     {v:"top",b:"早慶上智・旧帝・東大京大・医学部",s:"最難関レベル(次の質問で細分化)",ic:"m12 2 2.9 6.3 6.9.6-5.2 4.6 1.5 6.8L12 16.7l-6.1 3.6 1.5-6.8L2.2 8.9l6.9-.6L12 2Z"}
   ]},
  {q:"Q3 — 志望の詳細",title:"最難関の中では?",sub:"※Q2で最難関以外を選んだ場合はそのまま進みます",key:"tier2",cond:s=>s.tier==="top",
   opts:[
     {v:"sokei",b:"早慶・上智",s:"早稲田・慶應・上智(TEAP利用含む)",ic:"M6 20V8l6-4 6 4v12M10 20v-6h4v6"},
     {v:"kyutei",b:"地方旧帝",s:"北大・東北・名大・九大・神戸など",ic:"M6 20V8l6-4 6 4v12M10 20v-6h4v6"},
     {v:"top",b:"東大・京大・一橋・科学大",s:"最難関国立",ic:"m12 2 2.9 6.3 6.9.6-5.2 4.6 1.5 6.8L12 16.7l-6.1 3.6 1.5-6.8L2.2 8.9l6.9-.6L12 2Z"},
     {v:"med",b:"国公立医学部",s:"地方医〜旧帝医",ic:"M12 4v16M4 12h16"},
     /* 末尾に足す。共有 URL は選択肢の並び順で回答を持つため、既存の選択肢の
        前や間に挿すと、過去に共有された URL が別の回答として復元される */
     {v:"shiritsui",b:"私立医学部",s:"慈恵・日医・順天堂ほか",ic:"M12 4v16M4 12h16"}
   ]},
  {q:"Q4 — 現在地",title:"今の英語力は?",sub:"「完璧にできる」レベルで正直に選ぶのがコツ",key:"level",
   opts:[
     {v:"0",b:"ゼロ〜高校基礎レベル",s:"中学英文法や基礎単語に不安がある",ic:"M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM14 4v5h5"},
     {v:"1",b:"入試基礎は完成",s:"単語帳1冊+文法問題集を仕上げた",ic:"M5 12l4 4L19 6"},
     {v:"2",b:"入試標準まで完成",s:"解釈と標準レベルの長文まで一通り終えた",ic:"M5 13l3 3 5-6 3 4 3-8"}
   ]},
  {q:"Q5 — 残り時間",title:"受験までの時間は?",sub:"学習方針(網羅型か精選型か)を決めます",key:"time",
   opts:[
     {v:"long",b:"高1・高2(たっぷり)",s:"網羅系にじっくり取り組める",ic:"M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"},
     {v:"mid",b:"高3の春〜夏",s:"効率と網羅のバランス型",ic:"M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"},
     {v:"short",b:"高3の秋以降・既卒で時間がない",s:"精選型で最短ルートを取る",ic:"M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"}
   ]}
];
/* ============================================================
   STATE & NAV
   ============================================================ */
/* bunri（英語では受験タイプ）は志望レベルから選ぶモードでのみ既定値を持つ。
   画面上の切り替えが常に見えていて、本人が動かせるためである。
   **志望校モードではこの値を使わない。** かつては国公立なら記述中心、私立なら
   マーク中心と黙って決めていたが、国公立でもマーク中心の方式、私立でも記述の
   多い方式があり、入力していない条件を入力したかのように使うことになる。
   bunriConfirmed は本人が選んだ記録で、大学の設置区分からは立てない */
const S = {view:"home", tier:null, bunri:"bun", policy:"omni", level:0,
           mode:"tier", uni:null, fac:"", sensei:null, moshi:"zento", hen:null, henAdj:null,
           done:new Set(), autoLevel:null, bunriConfirmed:null, bunriPicked:null};
const bookById = id => BOOKS.find(b=>b.id===id);

/* ============================================================
   ISBN-13 → ISBN-10(Amazonリンク・書影キー用)
   ============================================================ */
function isbn10Of(isbn13){
  if(!isbn13 || isbn13.length!==13 || !isbn13.startsWith("978")) return null;
  const core = isbn13.slice(3,12);
  let sum = 0;
  for(let i=0;i<9;i++) sum += (10-i) * (+core[i]);
  let chk = (11 - (sum % 11)) % 11;
  return core + (chk===10 ? "X" : String(chk));
}


/* ============================================================
   志望校マッチング
   ============================================================ */
function normQ(s){
  return (s||"").trim().toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))
    .replace(/[ 　・,、]/g,"");
}
function searchUnis(q){
  const n = normQ(q);
  if(!n) return [];
  const hit = [];
  UNIS.forEach(u=>{
    const hay = normQ(u.n + u.a);
    const short = normQ(u.n).replace(/大学$/,"");
    let score = -1;
    if(normQ(u.n)===n || normQ(u.a).split(/\s+/).some(x=>x===n)) score = 0;
    else if(short.startsWith(n) || normQ(u.n).startsWith(n)) score = 1;
    else if(u.a.toLowerCase().split(/\s+/).some(x=>normQ(x).startsWith(n))) score = 2;
    else if(hay.includes(n)) score = 3;
    if(score>=0) hit.push({u,score});
  });
  hit.sort((a,b)=>a.score-b.score || b.u.h-a.u.h);
  return hit.slice(0,8).map(x=>x.u);
}
const MED_RE = /医学部|医学科|医科|医学類/;
const MED_NG_RE = /看護|保健|検査|放射線|リハ|作業療法|理学療法|栄養|衛生|福祉|薬/;
const INTL_RE = /国際|外国語|英文|英語|グローバル|国際教養|コミュニケーション/;
function isMed(f){ return !!f && MED_RE.test(f) && !MED_NG_RE.test(f); }
/* 志望校+学部 → {tier, bunri, hen, label, extra} */
function resolveUni(u, fac){
  if(!u) return null;
  let tier = u.t, hen = u.h, extra = "";
  /* 設置区分からの読み替えは **候補** にとどめる。確定は本人の回答だけ */
  const suggested = (u.ty==="私立") ? "ri" : "bun";
  let bunri = S.bunriConfirmed || null;
  const med = isMed(fac);
  if(med){
    if(u.ty==="私立"){ tier = "shiritsui"; hen = Math.max(hen, 59); bunri = "ri"; extra = "医学部医学科は同大の他学部より英語の要求水準が大きく上がります。医系長文・語彙の対策に加え、大学ごとの形式差が非常に大きいため過去問への着手を早めてください。"; }
    else { tier = "med"; hen = Math.max(hen, 62); bunri = "bun"; extra = "国公立医学部医学科は他学部より要求水準が一段上がります。医系テーマの長文と記述答案の精度、共テ英語9割ラインが目標です。"; }
  } else if(u.t==="shiritsui" || u.t==="med"){
    /* 単科医大に非医学科を入れた場合の保険 */
    if(fac && !MED_RE.test(fac)){ tier = u.ty==="私立" ? "nikkoma" : "chikoku"; hen = Math.max(40, hen-12); extra="医学科以外の学科として判定しています。"; }
  }
  if(!med && fac && INTL_RE.test(fac)) extra += "国際・外国語系の学部は英語の配点・要求水準が高めです。語彙の2冊目と長文・リスニングの上乗せを推奨します。";
  if(!bunri){
    return {needsBunri:true, suggestedBunri:suggested,
            reason:(u.ty==="私立" ? "私立大学のため、マーク中心と推定しました" : "国公立大学のため、記述中心と推定しました"),
            tier, hen, med, extra, label:u.n + (fac ? " " + fac.trim() : "")};
  }
  if(!ROUTES[tier][bunri]) bunri = ROUTES[tier].ri ? "ri" : "bun";
  return {tier, bunri, hen, med, extra, label:u.n + (fac ? " " + fac.trim() : "")};
}

/** 受験タイプの確認ボタンから呼ばれる。"bun"（記述中心）/ "ri"（マーク中心）/ "unknown" */
function pickBunri(v){
  S.bunriPicked = v;
  S.bunriConfirmed = (v==="bun"||v==="ri") ? v : null;
  if(S.bunriConfirmed){
    S.bunri = S.bunriConfirmed;
    document.querySelectorAll("#segBunri button").forEach(b=>b.classList.toggle("on", b.dataset.v===S.bunri));
  }
  applyUni();
}

/* ============================================================
   学習状況 → 現在地の推定
   ============================================================ */
/* 新刊は難易度を持たない。そのまま通すと比較が全部 false になり「最難関を終えた人」に
   化けて診断の現在地が跳ね上がる。判定できない本は null を返し、呼び出し側で飛ばす */
function bookLv(b){ if(isProv(b) || b.diff==null) return null; return b.diff<=2 ? 0 : b.diff<=4 ? 1 : b.diff<=6 ? 2 : 3; }
function levelFromHen(h){
  if(h==null) return null;
  if(h < 45) return 0;
  if(h < 55) return 1;
  if(h < 63) return 2;
  return 3;
}
function levelFromDone(){
  let lv = null;
  S.done.forEach(id=>{
    const b = bookById(id); if(!b) return;
    const v = bookLv(b); if(v==null) return;
    lv = lv==null ? v : Math.max(lv, v);
  });
  return lv;
}
/**
 * 模試の種類。**固定値での偏差値換算はしない。**
 *
 * かつては進研 -12・駿台全国判定 -3・駿台全国 +10・東進 +2/+8・校内 -6 を
 * 一律に足し引きし、「目標まで +8.0」のような表示を出していた。だが模試間の差は
 * 科目・母集団・回次で大きく変わり、一律の数値で置き換えられるものではない。
 * 数字を足した時点で、根拠のない精度が生まれる。
 *
 * そこで、サイト内の到達目安（全統記述の帯で付けてある）と直接比べるのは
 * 全統記述模試だけにし、それ以外は偏差値を目標との差の計算に使わない。
 * 現在地は完了済み教材と自己評価から見る。
 *
 * 将来、実データにもとづく対応関係を登録できるようになったらここに足す。
 * 偽の換算表を作らないこと。
 */
const MOSHI = {
  zento:          {label:"全統記述模試(河合塾)",        comparable:true},
  kyote_kawai:    {label:"全統共通テスト模試(河合塾)",  comparable:false},
  shinken:        {label:"進研模試(ベネッセ)",          comparable:false},
  sundai_hantei:  {label:"駿台全国判定模試",            comparable:false},
  sundai_zenkoku: {label:"駿台全国模試(ハイレベル)",    comparable:false},
  toshin_kyote:   {label:"東進 共通テスト本番レベル",   comparable:false},
  toshin_nankan:  {label:"東進 難関大本番レベル",       comparable:false},
  konai:          {label:"学校の実力テスト・校内模試",  comparable:false},
};
/** その模試の偏差値を、サイト内の到達目安と直接比べてよいか */
function moshiComparable(){ return !!(MOSHI[S.moshi] && MOSHI[S.moshi].comparable); }
function recalcStatus(){
  const raw = S.hen;
  /* 換算しない。入力された偏差値をそのまま持ち、比べてよいのは全統記述だけ */
  S.henAdj = (raw==null || isNaN(raw)) ? null : Math.round(raw*10)/10;
  const a = levelFromHen(S.henAdj), b = levelFromDone();
  let lv = null;
  if(a!=null && b!=null) lv = Math.min(3, Math.round((a+b)/2 + 0.01));
  else if(a!=null) lv = a;
  else if(b!=null) lv = b;
  S.autoLevel = lv;
  if(lv!=null){
    S.level = lv;
    document.querySelectorAll("#segLevel button").forEach(x=>x.classList.toggle("on", +x.dataset.v===lv));
  }
  renderVerdict();
  renderRoute();
}
function targetHen(){
  if(S.mode==="uni" && S.uni){ const r = resolveUni(S.uni, S.fac); return r ? r.hen : null; }
  if(S.mode==="sensei") return null;
  const t = TIERS.find(x=>x.id===S.tier);
  if(!t) return null;
  const m = (t.hensachi||"").match(/(\d+)\s*〜\s*(\d+)/);
  return m ? +m[2] : null;
}
function renderVerdict(){
  const el = document.getElementById("statusVerdict");
  if(S.henAdj==null && S.done.size===0){ el.classList.remove("on"); el.innerHTML=""; return; }
  const tgt = targetHen();
  const LVN = ["ゼロ〜高校基礎","入試基礎まで完成","入試標準まで完成","応用まで完成"];
  /* 目標との差を数字で出してよいのは、到達目安と同じ物差しの模試だけ。
     ほかの模試の偏差値をそのまま引き算すると、実在しない精度の判定になる */
  const cmp = moshiComparable();
  let gapHtml = "";
  if(S.henAdj!=null && tgt && cmp){
    const gap = Math.max(0, Math.round((tgt - S.henAdj)*10)/10);
    const pct = Math.max(4, Math.min(100, Math.round(S.henAdj / tgt * 100)));
    gapHtml = `<div class="v-item" style="flex:1;min-width:150px"><dt>目標までの差</dt>
      <dd>${gap>0?"+"+gap:"到達"}<small>${gap>0?" 必要":""}</small></dd>
      <div class="gap-bar"><i style="width:${pct}%"></i></div></div>`;
  }
  const moshiNote = (S.henAdj!=null && !cmp)
    ? `<p class="v-note">サイト内の到達目安は<b>全統記述模試（河合塾）</b>の帯で付けています。`
      + `${(MOSHI[S.moshi]||{}).label||"この模試"}との間に、一律に足し引きできる対応関係はありません。`
      + `模試間の単純換算はできないため、完了済み教材と自己評価を中心に判定します。</p>`
    : "";
  el.classList.add("on");
  el.innerHTML = `
    <div class="v-row">
      ${S.henAdj!=null?`<div class="v-item"><dt>入力した偏差値</dt><dd>${S.henAdj}</dd><small class="v-src">${(MOSHI[S.moshi]||{}).label||""}</small></div>`:""}
      ${tgt?`<div class="v-item"><dt>目標の到達目安</dt><dd>${tgt}</dd><small class="v-src">全統記述の帯</small></div>`:""}
      <div class="v-item"><dt>推定される現在地</dt><dd style="font-size:13px;font-family:var(--jp);padding-top:4px">${LVN[S.level]}</dd></div>
      ${gapHtml}
    </div>
    ${moshiNote}
    <b>この情報をルートに反映しました。</b>${S.done.size?`登録した${S.done.size}冊は<b style="color:var(--ok)">習得済み</b>として表示し、`:""}現在地より下の段階は「スキップ可」として薄く表示しています。${S.henAdj!=null&&tgt&&S.henAdj>=tgt?"すでに目標水準に届いているので、過去問演習と弱点分野(英作文・リスニング等)の補強を主軸にしてください。":"「▶ ここから」と表示された1冊から着手してください。"}`;
}

/* 画面はハッシュで指し示せる（/<科目>/#catalog など）。ポータルや外部からの直リンクの宛先になる。
   履歴には積まない（replaceState）。この SPA は「戻る」を画面遷移として扱っていないため、
   pushState にすると戻るたびに 1 画面ずつ遡ることになり、サイトを離れられなくなる。 */
const VIEWS = ["home","catalog","route","quiz","guide"];
function go(view){
  S.view = view;
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active", v.id==="view-"+view));
  document.querySelectorAll("#navDesktop button, #tabbar button").forEach(b=>{
    const on = b.dataset.view===view;
    b.classList.toggle("active", on);
    /* 見た目の色だけでなく、支援技術にも「いまここ」を伝える */
    if(on) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current");
  });
  window.scrollTo({top:0});
  if(view==="quiz" && !quizState.started) startQuiz();
  syncHash(view);
}
function syncHash(view){
  try{
    const want = view==="home" ? "" : "#"+view;
    if(location.hash === want) return;
    history.replaceState(null, "", location.pathname + location.search + want);
  }catch(e){ /* history に触れない環境では URL が追従しないだけ */ }
}
/** ハッシュが指す画面へ移る。未知のハッシュは無視して現在の画面のままにする */
function applyHash(){
  const v = (location.hash || "").slice(1);
  if(VIEWS.indexOf(v) >= 0 && v !== S.view) go(v);
}
window.addEventListener("hashchange", applyHash);

/* ============================================================
   COVERS — 実表紙画像(Amazon→NDL→openBD)+自動フォールバック
   ============================================================ */
/* 書影は Amazon が提供する商品画像URLを第一参照とし、取得できない場合は
   国立国会図書館サーチの書影API・openBD(いずれもISBNベースの公開API)を参照します。
   画像の保存・再アップロード・加工は行っていません。 */
function coverSrcs(b){
  /* nocover: 商品画像がどこにも無いと確認できた本（未発売など）。
     Amazon は画像を持たない ISBN に「書名だけを刷った自動生成画像」を返すことがあり、
     これは 1x1 判定にも onerror にも掛からないので、候補を空にして代替表示へ落とす。
     生成側は build/lib/cover.mjs が同じ分岐を持つ */
  if(b.nocover) return [];
  const key = b.isbn10 || b.asin || "";
  const list = [];
  if(b.cover) list.push(b.cover);
  if(key){
    list.push(`https://images-fe.ssl-images-amazon.com/images/P/${key}.09.LZZZZZZZ.jpg`);
    list.push(`https://images-na.ssl-images-amazon.com/images/P/${key}.09.LZZZZZZZ.jpg`);
  }
  if(b.isbn13){
    list.push(`https://ndlsearch.ndl.go.jp/thumbnail/${b.isbn13}.jpg`);
    list.push(`https://cover.openbd.jp/${b.isbn13}.jpg`);
  }
  return list;
}
/* ---------- アフィリエイトリンク ---------- */
function amazonURL(b){
  /* ルート上の枠（志望校の過去問など）は特定の商品ではない。直リンクを出すと、
     志望校が違う利用者を別大学の 1 冊へ送ってしまう。検索結果へ送る */
  if(b.recordType === "routePlaceholder"){
    const q = encodeURIComponent(b.official || b.name);
    return `https://www.amazon.co.jp/s?k=${q}` + (CONFIG.amazonTag ? `&tag=${CONFIG.amazonTag}` : "");
  }
  const k = b.isbn10 || b.asin;
  if(k) return `https://www.amazon.co.jp/dp/${k}/ref=nosim` + (CONFIG.amazonTag ? `?tag=${CONFIG.amazonTag}` : "");
  if(b.azq) return `https://www.amazon.co.jp/s?k=${encodeURIComponent(b.azq)}` + (CONFIG.amazonTag ? `&tag=${CONFIG.amazonTag}` : "");
  return null;
}
function rakutenURL(b){
  if(!CONFIG.rakutenId) return null;
  const dest = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(b.isbn13 || b.name)}/`;
  return `https://hb.afl.rakuten.co.jp/hgc/${CONFIG.rakutenId}/?pc=${encodeURIComponent(dest)}&m=${encodeURIComponent(dest)}`;
}
function coverHTML(b){
  const n = b.name.length;
  const cls = n>14 ? "xlong" : (n>9 ? "long" : "");
  /* fb（書影が取れないときの代替色）は手で決める装飾。新刊はまだ持たないので既定色を当てる。
     ここを素通りさせると b.fb.bg が TypeError になり、図鑑の描画そのものが止まる */
  const fbc = b.fb || {bg:"linear-gradient(160deg,#8A8F9E,#5A6070)"};
  const fbStyle = `background:${fbc.bg}${fbc.light ? ";color:#1B2233;text-shadow:none" : ""}`;
  const fb = `<div class="bcov-fb${fbc.light ? " light" : ""}" style="${fbStyle}"><span class="fb-spine"></span><span class="fb-pub">${b.pub}</span><span class="fb-title ${cls}">${b.name}</span><span class="fb-band">${b.subjects || ""}</span></div>`;
  const srcs = coverSrcs(b);
  if(!srcs.length) return `<div class="bcov fb">${fb}</div>`;
  return `<div class="bcov"><img src="${srcs[0]}" alt="" loading="lazy" referrerpolicy="no-referrer" data-srcs="${srcs.join("|")}" data-s="0" onload="covLoad(this)" onerror="covErr(this)">${fb}</div>`;
}
/* 書影の枠は、描き直しで入れ替わっていることがある（起動前に届いた読み込み完了を
   あとから処理する場合など）。closest が null を返しうるので必ず確かめる */
function covLoad(img){
  if(img.naturalWidth<=1){ covErr(img); return; }
  const w = img.closest(".bcov"); if(w) w.classList.add("ok");
}
function covErr(img){
  const srcs = (img.dataset.srcs||"").split("|");
  const next = (+img.dataset.s) + 1;
  if(next < srcs.length){ img.dataset.s = String(next); img.src = srcs[next]; }
  else { img.classList.add("hide"); const w = img.closest(".bcov"); if(w) w.classList.add("fb"); }
}

/* ============================================================
   CATALOG — 分野別×難易度順
   ============================================================ */
let catStage="all", catBunri="all", catSensei="all";
/* 講師別の著作リスト(図鑑フィルタ用) */
const SENSEI_BOOKS = {
  seki: new Set(["stock3000","stock4500","sparta","hinshutsu-polaris","shin-taizen","polaris-b0","polaris-b1","polaris-b2","polaris-b3","final-polaris","kaishaku-polaris1","kaishaku-polaris2","sekaiichi-dokkai","essentials100","essentials-max","rules1","rules2","rules3","rules4","cho-polaris0","cho-polaris1","cho-polaris2","cho-polaris3","chobun-platinum","spectre","eisaku-polaris1","eisaku-polaris2","sekaiichi-eisaku","eisaku-platinum","lis-platinum","seki-kyote","todai-kakushin","sekaiichi-waseda","sekaiichi-keio"]),
  takeoka: new Set(["leap","leap-basic","hikkei-hyogen","ultimate600","nyumon-eibun","jukou-jo","jukou-ge","gensoku125","supremacy","dragon100","takeoka-omoshiro","kiso-eisaku","yokubari","takeoka-r","takeoka-lis","manten-kotsu","todai25","todai-yoyaku","yoshi-yoyaku"]),
  hijii: new Set(["hijii-tango","extreme","hijii-zero","hijii-zero-next","hijii-bunpo-sol","hijii-dokkai-hisshu","hijii-dokkai-nankan","hijii-zero-chobun","solution0","solution1","solution2","solution3","solution-theme","hijii-sakubun","hijii-tadashiku","hijii-sugu-jiyu","hijii-zero-lis","kimeru-lis","kimeru-r"])
};
function buildFilters(){
  const fs = document.getElementById("filterScroll");
  let h = `<button class="chip active" data-k="stage" data-v="all" onclick="setFilter('stage','all',this)">すべて</button>`;
  for(const k in STAGES) h += `<button class="chip" data-k="stage" data-v="${k}" onclick="setFilter('stage','${k}',this)">${STAGES[k].label}</button>`;
  h += `<span style="flex:none;width:1px;background:var(--line-d);margin:2px 4px"></span>`;
  h += `<button class="chip active" data-k="bunri" data-v="all" onclick="setFilter('bunri','all',this)">全対象</button>`;
  h += `<button class="chip" data-k="bunri" data-v="bun" onclick="setFilter('bunri','bun',this)">国公立二次向け</button>`;
  h += `<button class="chip" data-k="bunri" data-v="ri" onclick="setFilter('bunri','ri',this)">私立個別向け</button>`;
  h += `<span style="flex:none;width:1px;background:var(--line-d);margin:2px 4px"></span>`;
  h += SENSEIS.map(s=>`<button class="chip" data-k="sensei" data-v="${s.id}" onclick="setFilter('sensei','${s.id}',this)" style="--tc:${s.color}">${s.name.replace("ルート","")}の本</button>`).join("");
  fs.innerHTML = h;
}
function setFilter(k,v,btn){
  if(k==="stage") catStage=v;
  else if(k==="bunri") catBunri=v;
  else if(k==="sensei"){ catSensei = (catSensei===v) ? "all" : v; v = catSensei; }
  document.querySelectorAll(`.chip[data-k="${k}"]`).forEach(c=>c.classList.toggle("active", c.dataset.v===v));
  renderCatalog();
}
/* 絞り込みの結果が 0 件のときに出す。空文字だと前の結果が残って見える */
const EMPTY_HTML = `<div class="cat-empty">条件に合う参考書がありません。絞り込みを緩めてください。</div>`;

function bookCardHTML(b){
  const st = STAGES[b.stage];
  const dots = isProv(b) ? "" : Array.from({length:10},(_,i)=>`<i style="${i<b.diff?`background:${diffColor(b.diff)}`:""}"></i>`).join("");
  return `<div class="book-card" role="button" tabindex="0" onclick="openModal('${b.id}')">
    <div class="book-card__cover">${coverHTML(b)}</div>
    <div class="book-card__body">
      <div class="bc-name">${b.name}</div>
      <div class="bc-pub">${b.pub}</div>
      <div class="bc-diff"><span class="diff-dots">${dots}</span></div>
      <div class="bc-hensachi">${isProv(b) ? `<span class="bc-prov">${PROV_LABEL}</span>` : `目安 <b>${b.hensachi}</b>`}</div>
      <div class="bc-tags"><span class="tag tag-stage" style="background:${st.color}">${st.short}</span>${b.subjects ? `<span class="tag" style="background:var(--surface-3);color:var(--ink-2)">${b.subjects.split(" ")[0]}</span>` : ""}</div>
    </div>
  </div>`;
}
function renderCatalog(){
  const q = (document.getElementById("book-search").value||"").trim().toLowerCase();
  const sort = document.getElementById("sortSel").value;
  let list = BOOKS.filter(b=>{
    if(catStage!=="all" && b.stage!==catStage) return false;
    if(catBunri==="bun" && b.bunri==="ri") return false;
    if(catBunri==="ri" && b.bunri==="bun") return false;
    if(catSensei!=="all" && !SENSEI_BOOKS[catSensei].has(b.id)) return false;
    if(q){
      const hay = (b.name+b.official+b.pub+b.desc+b.subjects+(b.unis||[]).join(" ")).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  document.getElementById("catCount").textContent = list.length;
  const grid = document.getElementById("bookGrid");
  if(sort==="field"){
    /* 分野別セクション×難易度順 */
    let html = "";
    for(const k in STAGES){
      const group = list.filter(b=>b.stage===k).sort(byDiffAsc);
      if(!group.length) continue;
      html += `<div class="cat-sec" style="--sc:${STAGES[k].color}">${STAGES[k].label}<small>${group.length} BOOKS — やさしい順</small></div>`;
      html += group.map(bookCardHTML).join("");
    }
    grid.innerHTML = html || EMPTY_HTML;
    return;
  }
  if(sort==="diff-asc") list.sort(byDiffAsc);
  else if(sort==="diff-desc") list.sort(byDiffDesc);
  else list.sort((a,b)=>a.name.localeCompare(b.name,"ja"));
  grid.innerHTML = list.map(bookCardHTML).join("") || EMPTY_HTML;
}

/* ============================================================
   MODAL
   ============================================================ */
function findConnections(id){
  const prev=new Set(), next=new Set();
  const scan = seq => {
    seq.forEach((s,i)=>{
      if(s.id===id){
        if(i>0) prev.add(seq[i-1].id);
        if(i<seq.length-1) next.add(seq[i+1].id);
      }
    });
  };
  for(const t in ROUTES){
    for(const br of ["bun","ri"]){
      const g = ROUTES[t][br]; if(!g) continue;
      for(const pol of ["omni","quick"]) scan(g[pol]||[]);
    }
  }
  SENSEIS.forEach(s=>scan(s.seq));
  prev.delete(id); next.delete(id);
  return {prev:[...prev].slice(0,3), next:[...next].slice(0,3)};
}
function openModal(id){
  const b = bookById(id); if(!b) return;
  const st = STAGES[b.stage];
  const con = findConnections(id);
  const conRow = (ids,dir)=> ids.map(pid=>{
    const p = bookById(pid);
    return `<div class="connect-item" onclick="openModal('${p.id}')">
      <span class="ci-dir">${dir}</span>
      <div class="ci-txt"><b>${p.name}</b><span>${STAGES[p.stage].label} ・ ${p.pub}</span></div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </div>`;
  }).join("");
  const az = amazonURL(b), rk = rakutenURL(b);
  const ext = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M14 4h6v6M20 4 10 14M9 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  const detail = `<div class="mb-block"><h6>この参考書をもっと詳しく</h6>
    <a class="detail-btn" href="/english/books/${b.id}/">
      <span>「${b.name}」の詳細ページ<small>${isProv(b) ? "書誌情報と役割（評価は準備中）" : "レベル・向いている人・同じレベルの他の選択肢・次に進む本"}</small></span>
      <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a></div>`;
  const amazon = (az||rk) ? `<div class="mb-block"><h6>購入・詳細を見る</h6>
    <div class="aff-actions">
      ${az?`<a class="aff-btn amz" href="${az}" target="_blank" rel="nofollow${AFF_AZ?' sponsored':''} noopener noreferrer">Amazonで見る${ext}</a>`:""}
      ${rk?`<a class="aff-btn rkt" href="${rk}" target="_blank" rel="nofollow${AFF_RK?' sponsored':''} noopener noreferrer">楽天ブックスで検索${ext}</a>`:""}
    </div>
    <p class="aff-note">${AFF?`${AFF_STORES}へのリンクは広告リンクです。リンク経由で購入された場合、当サイトに紹介料が発生することがあります(価格は変わりません)。`:""}版の改訂により内容が異なる場合がありますので、購入前に販売ページで最新版をご確認ください。</p>
  </div>` : "";
  document.getElementById("modalInner").innerHTML = `
    <div class="modal__grab"></div>
    <div class="modal__head">
      <div class="modal__cover">${coverHTML(b)}</div>
      <div class="modal__titles">
        <span class="tag tag-stage modal__stage" style="background:${st.color}">${st.label}</span>
        <h3>${b.name}</h3>
        <div class="modal__pub">${b.pub} ・ ${b.year}${b.isbn13?` ・ ISBN ${b.isbn13}`:""}</div>
        <div class="modal__official">${b.official}</div>
      </div>
      <button class="modal__close" onclick="closeModal()" aria-label="閉じる"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>
    </div>
    <dl class="spec-grid">
      <div class="spec"><dt>難易度</dt><dd>${isProv(b) ? `<span class="spec-prov">${PROV_LABEL}</span>` : `${b.diff}<small> /10</small><div class="diffbar"><i style="width:${b.diff*10}%;background:${diffColor(b.diff)}"></i></div>`}</dd></div>
      <div class="spec"><dt>対象・到達目安</dt><dd style="font-size:12.5px;line-height:1.4">${b.hensachi || "評価準備中"}</dd></div>
      <div class="spec"><dt>分量</dt><dd style="font-size:12px;line-height:1.4">${b.problems || "—"}</dd></div>
      <div class="spec"><dt>目安時間</dt><dd style="font-size:12.5px">${b.hours || "—"}</dd></div>
    </dl>
    <div class="modal__body">
      ${isProv(b) ? `<div class="mb-block"><h6>この本の評価について</h6><p class="mb-desc">${b.pub}から刊行された新刊です。現物の確認が済んでいないため、難易度・到達目安・強み・注意点・向いている人はまだ書いていません。このサイトの難易度は収録している全冊を同じ物差しで並べているので、確認しないまま数字を置くと物差し自体が狂います。推測では書きません。</p></div>` : `<div class="mb-block"><h6>どんな本?</h6><p class="mb-desc">${b.desc}</p></div>
      <div class="mb-block pc-cols">
        <div class="pc-box pros"><h6>強み</h6><ul>${(b.pros||[]).map(p=>`<li>${p}</li>`).join("")}</ul></div>
        <div class="pc-box cons"><h6>注意点</h6><ul>${(b.cons||[]).map(c=>`<li>${c}</li>`).join("")}</ul></div>
      </div>
      <div class="mb-block"><h6>こんな人に</h6><p class="mb-desc">${b.bestFor}</p></div>`}
      ${(b.unis||[]).length ? `<div class="mb-block"><h6>対象大学の目安</h6><div class="uni-tags">${b.unis.map(u=>`<span class="uni-tag">${u}</span>`).join("")}</div></div>` : ""}
      ${(con.prev.length||con.next.length)?`<div class="mb-block"><h6>ルート上の接続</h6><div class="connect-row">${conRow(con.prev,"前に")}${conRow(con.next,"次に")}</div></div>`:""}
      ${detail}
      ${amazon}
    </div>`;
  document.getElementById("bookModal").classList.add("open");
  modalOpened("modalInner");
  document.body.style.overflow="hidden";
}
function closeModal(){
  document.getElementById("bookModal").classList.remove("open");
  modalClosed();
  document.body.style.overflow="";
}

/* ============================================================
   ROUTE VIEW
   ============================================================ */
function buildRoutePicker(){
  document.getElementById("routePicker").innerHTML = TIERS.map(t=>`
    <button class="rpick${S.mode==="tier"&&S.tier===t.id?" sel":""}" style="--tc:${t.color}" onclick="selectTier('${t.id}')">
      <span class="rpick__no">ROUTE ${t.no}</span>
      <b>${t.name}</b><span>${t.sub}</span>
    </button>`).join("");
}
function buildSenseiPicker(){
  document.getElementById("senseiPicker").innerHTML = SENSEIS.map(s=>`
    <button class="rpick${S.mode==="sensei"&&S.sensei===s.id?" sel":""}" style="--tc:${s.color}" onclick="selectSensei('${s.id}')">
      <span class="rpick__no">TEACHER — ${s.tag}</span>
      <b>${s.name}</b><span>${s.sub}</span>
    </button>`).join("");
}
function selectTier(id){
  S.tier=id; S.mode="tier"; S.uni=null; S.sensei=null;
  if(!ROUTES[id][S.bunri]){
    S.bunri = ROUTES[id].ri ? "ri" : "bun";
    document.querySelectorAll("#segBunri button").forEach(b=>b.classList.toggle("on", b.dataset.v===S.bunri));
  }
  syncMode(); buildRoutePicker(); buildSenseiPicker(); renderVerdict(); renderRoute();
}
function selectSensei(id){
  S.sensei=id; S.mode="sensei"; S.uni=null;
  syncMode(); buildSenseiPicker(); buildRoutePicker(); renderVerdict(); renderRoute();
}

/* ---------- mode switch ---------- */
function syncMode(){
  document.querySelectorAll(".mtab").forEach(b=>b.classList.toggle("on", b.dataset.m===S.mode));
  document.getElementById("modeTier").style.display   = S.mode==="tier"   ? "" : "none";
  document.getElementById("modeUni").style.display    = S.mode==="uni"    ? "" : "none";
  document.getElementById("modeSensei").style.display = S.mode==="sensei" ? "" : "none";
}
function setMode(m){
  S.mode = m; syncMode();
  if(m==="uni"){ applyUni(); document.getElementById("uniInput").focus(); }
  else if(m==="sensei"){ buildSenseiPicker(); renderVerdict(); renderRoute(); }
  else { renderVerdict(); renderRoute(); }
}

/* ---------- university suggest ---------- */
let sugIdx = -1, sugList = [];
/* ------------------------------------------------------------
   候補リストのアクセシビリティ（WAI-ARIA の combobox パターン）

   これまでは上下キーとクリックだけが動き、支援技術には「候補が開いた」ことも
   「いまどれを選んでいるか」も伝わっていなかった。全体検索（assets/js/search.js）
   と同じ操作・同じ属性にそろえる。
   ------------------------------------------------------------ */
function sugSync(inputId, boxId, idx){
  const inp = document.getElementById(inputId), box = document.getElementById(boxId);
  if(!inp || !box) return;
  const open = box.classList.contains("open");
  inp.setAttribute("aria-expanded", open ? "true" : "false");
  const opts = [...box.querySelectorAll('[role="option"]')];
  opts.forEach((b,i)=>{
    b.id = boxId + "Opt" + i;
    b.setAttribute("aria-selected", i===idx ? "true" : "false");
    b.classList.toggle("cur", i===idx);
  });
  if(open && idx>=0 && opts[idx]) inp.setAttribute("aria-activedescendant", opts[idx].id);
  else inp.removeAttribute("aria-activedescendant");
}

/** 候補リストを閉じ、支援技術にもそれを伝える */
function sugClose(inputId, boxId){
  const box = document.getElementById(boxId);
  if(box) box.classList.remove("open");
  sugSync(inputId, boxId, -1);
}

function renderUniSug(q){
  const box = document.getElementById("uniSug");
  sugList = searchUnis(q); sugIdx = -1;
  if(!q.trim()){ box.classList.remove("open"); box.innerHTML=""; sugSync("uniInput","uniSug",-1); return; }
  if(!sugList.length){
    box.classList.add("open");
    box.innerHTML = `<div class="sug-empty">該当する大学が見つかりません。<br>近い難易度の大学名を入れるか、「志望レベルから選ぶ」をご利用ください。</div>`;
    sugSync("uniInput","uniSug",-1);
    return;
  }
  box.classList.add("open");
  box.innerHTML = sugList.map((u,i)=>`<button type="button" role="option" aria-selected="false" onclick="pickUni(${i})"><b>${u.n}</b><span class="sug-ty">${u.ty}</span><span class="sug-h">目安 ${u.h}</span></button>`).join("");
  sugSync("uniInput","uniSug",sugIdx);
}
function pickUni(i){
  const u = sugList[i]; if(!u) return;
  S.uni = u;
  document.getElementById("uniInput").value = u.n;
  sugClose("uniInput","uniSug");
  applyUni();
}
function applyUni(){
  const box = document.getElementById("uniResult");
  if(!S.uni){
    box.innerHTML = `<div class="note-card info" style="margin-top:4px"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><p>大学名と学部を手がかりに、登録済みの到達目安と出題傾向から近いレベルの参考書ルートを提案します。個別試験の形式（記述中心 / マーク中心）は最後に確認します。大学・学部・入試方式によって必要科目は異なるため、出願時は公式募集要項を確認してください。</p></div>`;
    document.getElementById("routeOutput").innerHTML = "";
    return;
  }
  const r = resolveUni(S.uni, S.fac);
  if(r.needsBunri){
    /* 受験タイプが決まるまではルートを出さない */
    const t0 = TIERS.find(x=>x.id===r.tier);
    document.getElementById("routeOutput").innerHTML = "";
    box.innerHTML = `
      <div class="uni-card" style="--tc:${t0.color}">
        <div class="uni-card__top"><h4>${r.label}</h4><span>${S.uni.ty} ・ 英語の到達目安 偏差値 ${r.hen}</span></div>
        <div class="uni-card__map">
          <span class="tag">${t0.name} ルート</span><span class="arw">/</span><span>出題形式は未確認</span>
        </div>
        <div class="uni-card__note"><b>英語の出題傾向:</b> ${S.uni.no}。${r.extra||""}</div>
      </div>
      ${typeof RTBunri!=="undefined"
        ? RTBunri.promptHTML({kind:"examtype", suggested:r.suggestedBunri, reason:r.reason,
                              handler:"pickBunri", picked:S.bunriPicked})
        : `<div class="bnr"><p class="bnr-lead">個別試験の形式を下の「個別最適化」から選ぶと、ルートを表示します。</p></div>`}`;
    return;
  }
  S.tier = r.tier; S.bunri = r.bunri; S.sensei = null;
  document.querySelectorAll("#segBunri button").forEach(b=>b.classList.toggle("on", b.dataset.v===r.bunri));
  const t = TIERS.find(x=>x.id===r.tier);
  const fx = S.uni.fx||[];
  box.innerHTML = `
    <div class="uni-card" style="--tc:${t.color}">
      <div class="uni-card__top"><h4>${r.label}</h4><span>${S.uni.ty} ・ 英語の到達目安 偏差値 ${r.hen}</span></div>
      <div class="uni-card__map">
        <span class="tag">${t.name} ルート</span><span class="arw">/</span>
        <span>${r.bunri==="bun"?"国公立二次型(記述)":"私立個別型(マーク)"}</span><span class="arw">/</span>
        <span>${S.policy==="omni"?"王道網羅型":"時短・精選型"}</span>
      </div>
      <div class="uni-card__note"><b>英語の出題傾向:</b> ${S.uni.no}。${r.extra||""}
      ${fx.length?`<div class="fx-tags">${fx.map(k=>`<span class="fx-tag">重点:${k}</span>`).join("")}</div>`:""}
      </div>
    </div>`;
  buildRoutePicker(); renderVerdict(); renderRoute();
}

/* ---------- completed books picker ---------- */
let doneSugList = [], doneSugIdx = -1;
function renderDoneSug(q){
  const box = document.getElementById("doneSug");
  const n = normQ(q);
  if(!n){ box.classList.remove("open"); box.innerHTML=""; sugSync("doneInput","doneSug",-1); return; }
  doneSugList = BOOKS.filter(b=>!S.done.has(b.id) && normQ(b.name+b.official+b.pub).includes(n)).slice(0,8);
  box.classList.add("open");
  box.innerHTML = doneSugList.length
    ? doneSugList.map((b,i)=>`<button type="button" role="option" aria-selected="false" onclick="addDone(${i})"><b>${b.name}</b><span class="sug-ty">${STAGES[b.stage].short}</span><span class="sug-h">${b.pub}</span></button>`).join("")
    : `<div class="sug-empty">該当する参考書が見つかりません</div>`;
  doneSugIdx = -1;
  sugSync("doneInput","doneSug",doneSugIdx);
}
function addDone(i){
  const b = doneSugList[i]; if(!b) return;
  S.done.add(b.id);
  const inp = document.getElementById("doneInput");
  inp.value = ""; sugClose("doneInput","doneSug");
  renderDoneChips(); recalcStatus(); inp.focus();
}
function removeDone(id){ S.done.delete(id); renderDoneChips(); recalcStatus(); }
function renderDoneChips(){
  document.getElementById("doneChips").innerHTML = [...S.done].map(id=>{
    const b = bookById(id); if(!b) return "";
    return `<span class="done-chip">${b.name}<button onclick="removeDone('${id}')" aria-label="削除"><svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button></span>`;
  }).join("");
}
/** 二択・多択の切り替えボタンの選択状態を aria-pressed に反映する。
    見た目のクラス（.on）だけでは支援技術に伝わらないため、描画のたびにそろえる */
function segAria(){
  document.querySelectorAll(".seg-ctrl button").forEach(b=>{
    b.setAttribute("aria-pressed", b.classList.contains("on") ? "true" : "false");
  });
}

function wireSeg(id, key, cb){
  document.getElementById(id).addEventListener("click",e=>{
    const b = e.target.closest("button"); if(!b) return;
    document.querySelectorAll(`#${id} button`).forEach(x=>{
      const on = x===b;
      x.classList.toggle("on",on);
      /* 選択状態は色だけでなく aria-pressed でも伝える */
      x.setAttribute("aria-pressed", on ? "true" : "false");
    });
    S[key] = key==="level" ? +b.dataset.v : b.dataset.v;
    /* 画面上の切り替えを本人が動かしたら、確定した回答として扱う */
    if(key==="bunri"){ S.bunriConfirmed = b.dataset.v; S.bunriPicked = b.dataset.v; }
    if(cb) cb();
  });
}
function routeEmptyHTML(msg){
  return `<div class="route-empty">
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none"><path d="M6 20v-5a3 3 0 0 1 3-3h6a3 3 0 0 0 3-3V4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="6" cy="20" r="2" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="4" r="2" stroke="currentColor" stroke-width="1.6"/></svg>
    <p>${msg}</p></div>`;
}
function climbNodeHTML(s, i, st0, startIdx){
  const b = bookById(s.id);
  const cls = st0==="done" ? " done" : (st0==="skip" ? " skip" : (i===startIdx ? " active start" : " active"));
  const badge = st0==="done"
    ? `<span class="node-badge done">習得済み</span>`
    : (st0==="skip" ? `<span class="skip-badge">スキップ可</span>`
    : (i===startIdx ? `<span class="node-badge start">▶ ここから</span>` : ""));
  const st = STAGES[b.stage];
  const altHtml = s.alts && s.alts.length ? `<div class="cn-info__alt"><b>代替:</b> ${s.alts.map(a=>{
    const ab=bookById(a); return ab?`<button onclick="event.stopPropagation();openModal('${a}')">${ab.name}</button>`:"";
  }).filter(Boolean).join(" / ")}</div>` : "";
  return `<div class="climb-node${cls}" data-book-id="${b.id}" data-subject-id="english" data-h="${b.h}" data-hours="${String(b.hours||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;")}">
    <div class="cn-marker"><div class="cn-step">${st0==="done"?"✓":i+1}</div><div class="cn-lvl">${["導入","基礎","標準","応用","過去問"][s.lvl]}</div></div>
    <div class="cn-card" onclick="openModal('${b.id}')">
      ${badge}
      <div class="cn-card__cover">${coverHTML(b)}</div>
      <div class="cn-info">
        <span class="cn-info__role" style="background:${st.color}">${s.role}</span>
        <h3>${b.name}</h3>
        <div class="cn-info__note">${s.note}</div>
        ${altHtml}
        <div class="cn-info__meta">
          <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 8v4l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/></svg><b>${b.hours}</b></span>
          <span>難易度 <b>${b.diff}/10</b></span>
        </div>
      </div>
    </div>
  </div>`;
}
function paraNodeHTML(p, stepLabel){
  const b = bookById(p.id); if(!b) return "";
  const st = STAGES[b.stage];
  return `<div class="climb-node para" data-book-id="${b.id}" data-subject-id="english">
    <div class="cn-marker"><div class="cn-step">${stepLabel}</div></div>
    <div class="cn-card" onclick="openModal('${b.id}')">
      <div class="cn-card__cover">${coverHTML(b)}</div>
      <div class="cn-info">
        <span class="cn-info__role" style="background:${st.color}">${st.label}</span>
        <h4>${b.name}</h4>
        <div class="cn-info__note">${p.note}</div>
      </div>
    </div>
  </div>`;
}
/**
 * ルート画面を描き直す。
 * 共有ブロックは、実際にルートが引けたとき（.climb が出たとき）だけ添える。
 * 志望レベルを選ぶ前や講師未選択の案内だけのときは、共有するものが無い。
 */
function renderRoute(){
  /* 状態が変わる経路はすべてここを通る。途中で return する枝より前で同期する */
  segAria();
  renderRouteBody();
  RTPace.apply();
  const box = document.getElementById("routeShare");
  if(!box) return;
  box.innerHTML = document.querySelector("#routeOutput .climb") ? RTShare.routeBlock() : "";
}
/**
 * ルート本体を描く。共有ブロックの出し入れは renderRoute() が受け持つ。
 */
function renderRouteBody(){
  const out = document.getElementById("routeOutput");
  if(S.mode==="uni" && !S.uni){ out.innerHTML=""; return; }
  let seq, paras, sensei=null, tier=null;
  if(S.mode==="sensei"){
    sensei = SENSEIS.find(x=>x.id===S.sensei);
    if(!sensei){ out.innerHTML = routeEmptyHTML("上から講師を選ぶとルートが表示されます"); return; }
    seq = sensei.seq; paras = sensei.para||[];
  } else {
    if(!S.tier){ out.innerHTML = routeEmptyHTML("上から志望レベルを選ぶとルートが表示されます"); return; }
    tier = TIERS.find(t=>t.id===S.tier);
    const group = ROUTES[S.tier][S.bunri] || ROUTES[S.tier].ri || ROUTES[S.tier].bun;
    seq = group[S.policy];
    paras = (ROUTES[S.tier].para && (ROUTES[S.tier].para[S.bunri] || ROUTES[S.tier].para.ri)) || [];
  }
  const bound = [0,2,3,4][S.level];
  let active=0, hours=0;
  const state = seq.map(s=>{
    if(S.done.has(s.id)) return "done";
    if(s.lvl < bound && s.lvl < 4) return "skip";
    return "todo";
  });
  const startIdx = state.indexOf("todo");
  const nodes = seq.map((s,i)=>{
    if(state[i]==="todo"){ active++; hours += bookById(s.id).h; }
    return climbNodeHTML(s, i, state[i], startIdx);
  }).join("");
  const paraHtml = paras.length ? `
    <div class="para-head"><div class="para-head__spacer"></div><b>‖ 並行して進める(単語・熟語・リスニング)</b></div>
    ${paras.map(p=>paraNodeHTML(p,"並行")).join("")}` : "";
  /* 志望校の傾向対策(uniモードのみ) */
  let fxHtml = "";
  if(S.mode==="uni" && S.uni && (S.uni.fx||[]).length){
    const seqIds = new Set(seq.map(s=>s.id).concat(paras.map(p=>p.id)));
    const fxNodes = S.uni.fx.map(key=>{
      const f = FOCUS[key]; if(!f) return "";
      let id = f.id;
      if(seqIds.has(id) && f.alts){ const alt = f.alts.find(a=>!seqIds.has(a)); if(alt) id = alt; }
      return paraNodeHTML({id, note:`【重点:${key}】${f.note}`}, "傾向");
    }).filter(Boolean).join("");
    if(fxNodes) fxHtml = `
      <div class="para-head"><div class="para-head__spacer"></div><b>◎ ${S.uni.n}の出題傾向に合わせた重点対策</b></div>
      ${fxNodes}`;
  }
  const months = Math.max(1, Math.round(hours/90));
  const uniNote = (S.mode==="uni" && S.uni)
    ? `<div class="note-card info"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.4" stroke="currentColor" stroke-width="1.8"/></svg><p><b>${S.uni.n}${S.fac?" "+S.fac.trim():""}に合わせて調整しています</b>（到達目安から志望レベルを判定し、出題形式に対応する重点対策の枠を足しています）。${S.uni.no}。下部の「重点対策」は本学の英語の傾向に合わせた追加枠です。過去問の段は志望校の赤本に読み替えて進めてください。</p></div>`
    : "";
  const senseiNote = sensei
    ? `<div class="note-card info"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><p><b>${sensei.name}(${sensei.kana} / ${sensei.tag}):</b>${sensei.desc}<br><b>補完メモ:</b>${sensei.lack}</p></div>
       <div class="note-card"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 16h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><p><b>このルートは非公式です。</b>${sensei.name}は、講師ご本人・所属予備校・出版社とは無関係に、当サイトが市販の著作をもとに独自に構成したものです。ご本人の推奨・監修を受けたものではありません。<a href="/disclaimer/" style="color:var(--indigo);font-weight:700">免責事項</a></p></div>`
    : "";
  const polNote = sensei
    ? "講師ルート:解説の言葉づかい・方法論が全編で一貫しているため、本と本の間で「流儀の違い」に戸惑うことがなく、独学でも迷いにくいのが最大の利点です。"
    : (S.policy==="omni"
      ? "王道網羅型:網羅系の文法・解釈を軸にした、時間のある高1・高2や浪人生向けの盤石ルートです。単語・熟語の並行枠は毎日必ず回すのが鉄則。"
      : "時短・精選型:精選された薄めの教材を軸にした、高3からの巻き返しに強いルートです。1冊を「音読で完全消化」してから次へ進むのが鉄則。");
  const goalLabel = (S.mode==="uni"&&S.uni) ? S.uni.n+(S.fac?" "+S.fac.trim():"")+" 合格"
    : sensei ? sensei.name+" 完走" : tier.goal;
  const reachLabel = (S.mode==="uni"&&S.uni) ? "偏差値 "+resolveUni(S.uni,S.fac).hen
    : sensei ? "最難関まで対応" : tier.hensachi;
  const subLabel = sensei ? sensei.tag+" — 一気通貫" : `${S.bunri==="bun"?"国公立二次型":"私立個別型"} / ${S.policy==="omni"?"王道網羅型":"時短・精選型"}`;
  const goalCard = sensei
    ? `<h4>${sensei.name} 完走</h4><p>${sensei.sub}。過去問で志望校の形式に合わせて仕上げれば完成です。</p>`
    : `<h4>${tier.goal}</h4><p>${tier.name}(${S.bunri==="bun"?"国公立二次型":"私立個別型"})ルート完走。過去問で合格点を安定させたら完成です。</p>`;
  out.innerHTML = `
    <div class="route-summary">
      <dl style="display:contents">
        <div class="rs-item"><dt>残りの教材</dt><dd>${active}<small> 冊</small></dd></div>
        <div class="rs-item"><dt>残り目安時間</dt><dd>${hours>=1000?(hours/1000).toFixed(1)+"k":hours}<small> h</small></dd></div>
        <div class="rs-item"><dt>目安期間</dt><dd>${months}<small> か月〜</small></dd></div>
        <div class="rs-item"><dt>到達目安</dt><dd style="font-size:13px;line-height:1.4;padding-top:3px">${reachLabel}</dd></div>
      </dl>
      <div class="rs-goal"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 21V4m0 0h11l-2.5 4L17 12H6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>目標:<b>${goalLabel}</b> — ${subLabel}</div>
    </div>
    ${uniNote}
    ${senseiNote}
    <div class="climb">
      <div class="climb__rail"></div>
      <div class="climb__fill" style="height:100%"></div>
      ${nodes}
      ${paraHtml}
      ${fxHtml}
      <div class="climb-goal">
        <div class="cg-marker"><div class="cg-flag"><svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M6 21V4m0 0h11l-2.5 4L17 12H6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>
        <div class="cg-card">${goalCard}</div>
      </div>
    </div>
    <div class="note-card info"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><p>${polNote}</p></div>
    <div class="note-card"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 16h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><p><b>進め方の原則:</b>次の1冊に進む前に、今の1冊を「全文を音読しながら意味が取れる」状態まで完成させること。単語・熟語の並行枠は毎日必ず回してください。ルートの冊数をこなすことではなく、1冊ごとの完成度が合否を分けます。カードを押すと各書の詳細・代替書を確認できます。</p></div>`;
}

/* ============================================================
   HOME
   ============================================================ */
function renderHome(){
  document.getElementById("stat-books").textContent = BOOKS.length;
  document.getElementById("stat-unis").textContent = UNIS.length;
  document.getElementById("homeRoutes").innerHTML = TIERS.map(t=>{
    const g = ROUTES[t.id].ri || ROUTES[t.id].bun;
    const seq = g.quick || g.omni;
    return `<div class="rp-card" style="--tc:${t.color}" role="button" tabindex="0" onclick="selectTier('${t.id}');go('route')">
      <div class="rp-card__no"><span>ROUTE ${t.no}</span><em>${seq.length} STEPS</em></div>
      <h3>${t.name}</h3><p>${t.sub} — ${t.goal}</p>
    </div>`;
  }).join("");
  document.getElementById("homeSenseis").innerHTML = SENSEIS.map(s=>{
    return `<div class="rp-card" style="--tc:${s.color}" role="button" tabindex="0" onclick="selectSensei('${s.id}');go('route')">
      <div class="rp-card__no"><span>TEACHER ROUTE</span><em>${s.seq.length} STEPS</em></div>
      <h3>${s.name}</h3><p>${s.tag} — ${s.sub}</p>
    </div>`;
  }).join("");
  const disc = `<b>ご利用にあたって:</b>本サイトの難易度・到達偏差値・目安時間は、各出版社の公表情報と、大手予備校・塾が公開する学習ルート解説をもとにした<b>目安</b>です。効果には個人差があります。大学ごとの出題傾向・入試方式(英語外部試験の利用可否を含む)は年度により変更されるため、出願前に必ず募集要項をご確認ください。書影はAmazon等が提供する商品画像URLを参照して表示しています(画像の保存・加工は行っていません)。${AFF?"当サイトはアフィリエイト広告を利用しています。":""}`;
  document.getElementById("homeDisclaimer").innerHTML = disc;
  document.getElementById("catDisclaimer").innerHTML = disc;
  document.getElementById("guideDisclaimer").innerHTML = disc;
}

/* ============================================================
   QUIZ
   ============================================================ */
const quizState = {started:false, step:0, ans:{}};
function startQuiz(){ quizState.started=true; quizState.step=0; quizState.ans={}; renderQuiz(); }
function activeQuizSteps(){
  return QUIZ.filter(q=>!q.cond || q.cond(quizState.ans));
}
function renderQuiz(){
  const steps = activeQuizSteps();
  if(quizState.step >= steps.length){ renderQuizResult(); return; }
  const q = steps[quizState.step];
  const prog = steps.map((_,i)=>`<span class="qp-seg${i<quizState.step?" done":i===quizState.step?" cur":""}"></span>`).join("");
  document.getElementById("quizShell").innerHTML = `
    ${RTShare.beforeQuiz(quizState.step)}
    <div class="quiz-progress">${prog}</div>
    <div class="quiz-step">
      <div class="quiz-q">${q.q}</div>
      <div class="quiz-title">${q.title}</div>
      <div class="quiz-sub">${q.sub}</div>
      <div class="opt-list">${q.opts.map(o=>`
        <button class="opt${quizState.ans[q.key]===o.v?" sel":""}" onclick="pickOpt('${q.key}','${o.v}')">
          <span class="opt__txt"><b>${o.b}</b><span>${o.s}</span></span>
          <span class="opt__check"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></span>
        </button>`).join("")}
      </div>
      <div class="quiz-nav">
        ${quizState.step>0?`<button class="btn btn-back" onclick="quizState.step--;renderQuiz()">戻る</button>`:""}
        <button class="btn btn-primary" id="quizNext" onclick="nextQuiz()" ${quizState.ans[q.key]==null?"disabled style='opacity:.4;pointer-events:none'":""}>
          ${quizState.step===steps.length-1?"診断結果を見る":"次へ"}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>`;
}
function pickOpt(key,v){ quizState.ans[key]=v; renderQuiz(); }
function nextQuiz(){ quizState.step++; renderQuiz(); }
/**
 * 結果を出したあと、見出しへプログラム的にフォーカスを移す。
 *
 * キーボードや読み上げで使っている人は、押したボタンの位置に取り残されると
 * 結果がどこに出たのか分からない。**ページを開いた直後には動かさない**
 * （読み始めの位置を勝手に奪うため）。呼ぶのは操作の結果としてだけ。
 */
function focusResult(sel){
  try{
    const el = document.querySelector(sel);
    if(!el) return;
    if(!el.hasAttribute("tabindex")) el.setAttribute("tabindex","-1");
    el.focus({preventScroll:false});
  }catch(e){ /* フォーカスできなくても内容は読める */ }
}

function renderQuizResult(){
  const a = quizState.ans;
  let tier = a.tier==="top" && a.tier2 ? a.tier2 : (a.tier==="top" ? "top" : a.tier);
  if(a.tier!=="top") tier = a.tier;
  let bunri = a.bunri;
  if(tier==="med") bunri = a.bunri==="ri" ? "ri" : "bun";
  /* かつては「医学部 かつ マーク中心」を私立医と黙って読み替えていたが、
     国公立医志望でマーク中心を選んだ人まで私立医ルートへ送っていた。
     Q3 に私立医学部の選択肢を足したので、本人が選んだときだけ私立医にする */
  if(tier==="sokei") bunri = "ri";
  if(tier==="shiritsui") bunri = "ri";
  const policy = a.time==="long" ? "omni" : a.time==="short" ? "quick" : (["kyote","nikkoma"].includes(tier) ? "quick" : (+a.level>=1 ? "omni" : "quick"));
  const level = +a.level;
  const t = TIERS.find(x=>x.id===tier);
  const polLabel = policy==="omni" ? "王道網羅型" : "時短・精選型";
  const g = ROUTES[tier][bunri] || ROUTES[tier].ri || ROUTES[tier].bun;
  const seq = g[policy];
  const bound = [0,2,3][level];
  const books = seq.filter(s=>!(s.lvl<bound && s.lvl<4));
  document.getElementById("quizShell").innerHTML = `
    ${RTShare.beforeResult()}
    <div class="quiz-progress">${activeQuizSteps().map(()=>`<span class="qp-seg done"></span>`).join("")}</div>
    <div class="quiz-step">
      <div class="result-hero">
        <div class="rh-label">DIAGNOSIS COMPLETE — あなたにおすすめのルート</div>
        <h3>${t.name}<br><span style="font-size:16px;opacity:.85">${bunri==="bun"?"国公立二次型":"私立個別型"} × ${polLabel}</span></h3>
        <p>メイン教材 ${books.length} 冊+単語・熟語の並行枠。${policy==="omni"?"網羅系を軸に、盤石な土台から積み上げる王道の道筋です。":"精選された教材で最短距離を取る、巻き返しに強い道筋です。"}現在の学力に合わせて${level>0?"習得済みの段階はスキップ表示になります。":"導入から丁寧に始めます。"}</p>
      </div>
      <div class="opt-list" style="margin-top:14px">
        ${books.map((s,i)=>{
          const b=bookById(s.id); const st=STAGES[b.stage];
          return `<button class="opt" onclick="openModal('${b.id}')">
            <span class="opt__ic mono" style="font-size:13px;font-weight:600">${i+1}</span>
            <span class="opt__cov">${coverHTML(b)}</span>
            <span class="opt__txt"><b>${b.name}</b><span>${st.label} ・ ${b.hours}</span></span>
          </button>`;}).join("")}
      </div>
      <div class="quiz-nav">
        <button class="btn btn-back" onclick="RTShare.restart()">やり直す</button>
        <button class="btn btn-primary" onclick="applyQuiz('${tier}','${bunri}','${policy}',${level})">
          ルート全体を見る
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      ${RTShare.afterResult({tier:t.name, variant:bunri==="bun"?"国公立二次型":"私立個別型", policy:polLabel})}
    </div>`;
  focusResult("#quizShell .result-hero");
}
function applyQuiz(tier,bunri,policy,level){
  S.tier=tier; S.bunri=bunri; S.policy=policy; S.level=level; S.mode="tier"; S.uni=null; S.sensei=null; syncMode();
  document.querySelectorAll("#segBunri button").forEach(b=>b.classList.toggle("on",b.dataset.v===bunri));
  document.querySelectorAll("#segPolicy button").forEach(b=>b.classList.toggle("on",b.dataset.v===policy));
  document.querySelectorAll("#segLevel button").forEach(b=>b.classList.toggle("on",+b.dataset.v===level));
  buildRoutePicker(); renderVerdict(); renderRoute(); go("route");
}

/* ============================================================
   GUIDE / LEGAL
   ============================================================ */
function renderGuide(){
  document.getElementById("guideList").innerHTML = GUIDES.map((g,i)=>`
    <article class="g-card" id="g${i}">
      <button class="g-card__head" onclick="toggleGuide(${i})" aria-expanded="false">
        <span class="g-num">${String(i+1).padStart(2,"0")}</span>
        <span class="g-ttl"><h3>${g.t}</h3><span>${g.s}</span></span>
        <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="g-body">${g.b}</div>
    </article>`).join("");
}
function toggleGuide(i){
  const el = document.getElementById("g"+i);
  const open = el.classList.toggle("open");
  el.querySelector(".g-card__head").setAttribute("aria-expanded", open);
}

/* ============================================================
   INIT
   ============================================================ */
/* role="button" を付けた div を、Enter と Space でも押せるようにする。
   ネイティブの button と違い、div はキー操作でクリックが発火しない。 */
document.addEventListener("keydown", e => {
  if(e.key !== "Enter" && e.key !== " ") return;
  const el = e.target.closest('[role="button"][tabindex="0"]');
  if(!el) return;
  e.preventDefault();
  el.click();
});

/* ---------- モーダルのフォーカス管理 ----------
   開いたらモーダル内へフォーカスを移し、Tab の移動をモーダル内に閉じ込め、
   閉じたら元いた要素へ戻す。キーボードだけで操作する人が背景の
   リンクに迷い込まないようにするため。 */
let lastFocused = null;
function trapFocusables(box){
  return [...box.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null);
}
function modalOpened(boxId){
  lastFocused = document.activeElement;
  const box = document.getElementById(boxId);
  const f = trapFocusables(box);
  (f[0] || box).focus({preventScroll:true});
}
function modalClosed(){
  if(lastFocused && document.contains(lastFocused)) lastFocused.focus({preventScroll:true});
  lastFocused = null;
}
function openBox(){
  const el = document.getElementById("bookModal");
  if(el && el.classList.contains("open")) return document.getElementById("modalInner");
  return null;
}
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){ closeModal(); return; }
  if(e.key!=="Tab") return;
  const box = openBox();
  if(!box) return;
  const f = trapFocusables(box);
  if(!f.length) return;
  const first = f[0], last = f[f.length-1];
  if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
});
document.getElementById("book-search").addEventListener("input",()=>renderCatalog());
const afterOpt = ()=>{ if(S.mode==="uni"&&S.uni) applyUni(); else { renderVerdict(); renderRoute(); } };
wireSeg("segBunri","bunri",afterOpt);
wireSeg("segPolicy","policy",afterOpt);
wireSeg("segLevel","level",()=>{ S.autoLevel=null; renderVerdict(); renderRoute(); });

/* 志望校入力 */
const uniInput = document.getElementById("uniInput");
uniInput.addEventListener("input",e=>{ S.uni=null; renderUniSug(e.target.value); });
uniInput.addEventListener("focus",e=>{ if(e.target.value) renderUniSug(e.target.value); });
uniInput.addEventListener("keydown",e=>{
  const box = document.getElementById("uniSug");
  /* Escape は候補が開いていれば必ず閉じる。開いていなければブラウザに任せる */
  if(e.key==="Escape"){ if(box.classList.contains("open")){ e.preventDefault(); sugClose("uniInput","uniSug"); } return; }
  if(!box.classList.contains("open") || !sugList.length) return;
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    e.preventDefault();
    sugIdx = (sugIdx + (e.key==="ArrowDown"?1:-1) + sugList.length) % sugList.length;
    sugSync("uniInput","uniSug",sugIdx);
  } else if(e.key==="Home"){ e.preventDefault(); sugIdx=0; sugSync("uniInput","uniSug",sugIdx);
  } else if(e.key==="End"){ e.preventDefault(); sugIdx=sugList.length-1; sugSync("uniInput","uniSug",sugIdx);
  } else if(e.key==="Enter"){ e.preventDefault(); pickUni(sugIdx>=0?sugIdx:0); }
});
document.getElementById("facInput").addEventListener("input",e=>{ S.fac=e.target.value; if(S.uni) applyUni(); });
/* 学習状況 */
document.getElementById("moshiSel").addEventListener("change",e=>{ S.moshi=e.target.value; recalcStatus(); });
document.getElementById("henInput").addEventListener("input",e=>{
  const v = parseFloat(e.target.value);
  S.hen = (e.target.value==="" || isNaN(v)) ? null : v;
  recalcStatus();
});
const doneInput = document.getElementById("doneInput");
doneInput.addEventListener("input",e=>renderDoneSug(e.target.value));
doneInput.addEventListener("focus",e=>{ if(e.target.value) renderDoneSug(e.target.value); });
doneInput.addEventListener("keydown",e=>{
  const box = document.getElementById("doneSug");
  if(e.key==="Escape"){ if(box.classList.contains("open")){ e.preventDefault(); sugClose("doneInput","doneSug"); } return; }
  if(!box.classList.contains("open") || !doneSugList.length) return;
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    e.preventDefault();
    doneSugIdx = (doneSugIdx + (e.key==="ArrowDown"?1:-1) + doneSugList.length) % doneSugList.length;
    sugSync("doneInput","doneSug",doneSugIdx);
  } else if(e.key==="Enter"){ e.preventDefault(); addDone(doneSugIdx>=0?doneSugIdx:0); }
});
document.addEventListener("click",e=>{
  if(!e.target.closest("#uniSug")&&!e.target.closest("#uniInput")) sugClose("uniInput","uniSug");
  if(!e.target.closest("#doneSug")&&!e.target.closest("#doneInput")) sugClose("doneInput","doneSug");
});

buildFilters();
renderCatalog();
buildRoutePicker();
buildSenseiPicker();
renderRoute();
renderHome();
renderGuide();

/* ハッシュ付きで開かれていれば、その画面から始める（共有 URL の復元より先に評価する。
   ?v=1&a=... が付いていれば下の setup が診断結果へ上書きする） */
applyHash();

/* ============================================================
   ルート画面の共有
   共有 URL に載せるのはルートの形を決める設定だけ（?rv=1&r=…）。
   模試の偏差値・学部名・既習の参考書といった入力は載せない。
   検証はこのページ側で行う。トークンが指す志望レベル・トラックが
   実在しなければ復元せず、普通のトップページとして開く。
   ============================================================ */
const LEVELS = ["0","1","2","3"];
const POLICIES_OK = ["omni","quick"];

/** 受験タイプ・学習方針・現在地のセグメントを S に合わせる */
function syncRouteSegs(){
  document.querySelectorAll("#segBunri button").forEach(b=>b.classList.toggle("on", b.dataset.v===S.bunri));
  document.querySelectorAll("#segPolicy button").forEach(b=>b.classList.toggle("on", b.dataset.v===S.policy));
  document.querySelectorAll("#segLevel button").forEach(b=>b.classList.toggle("on", +b.dataset.v===S.level));
}
/** 共有 URL で指定された大学を UNIS から引き当てて、志望校モードにする */
function applySharedUni(name){
  const u = UNIS.find(x=>x.n===name);
  if(!u) return false;
  S.uni=u; S.fac=""; S.mode="uni"; S.sensei=null;
  document.getElementById("uniInput").value = u.n;
  syncMode(); applyUni();
  return true;
}


/**
 * 共有 URL に大学名（ru）を載せてよいかを判定し、載せてよいときだけ名前を返す。
 *
 * 共有 URL は「志望レベル・型・方針・現在地」しか持たない。学部名は個人が
 * 特定されうるので入れない。ところが受け取り側では大学名から判定をやり直すため、
 * 学部の入力で志望レベルが動いていた場合（医学部医学科など）、共有先では
 * 学部なしの判定に戻り、**元の結果と違う教材列が出る**。
 *
 * そこでここでは「共有先と同じ初期状態で解き直しても同じ結果になるか」を確かめ、
 * ならないときは大学名を載せない。載せないときは表示ラベルも志望レベル名になり、
 * 大学名・学部名は共有文にも出ない。
 */
function sharedUniName(){
  if(!(S.mode==="uni" && S.uni)) return null;
  const keep = S.bunriConfirmed;
  /* 受験区分はトークンに載るので、共有先でも同じ値が入る */
  S.bunriConfirmed = S.bunri;
  let r = null;
  try { r = resolveUni(S.uni, ""); } catch(e){ r = null; } finally { S.bunriConfirmed = keep; }
  if(!r || r.needsBunri) return null;
  return (r.tier === S.tier && r.bunri === S.bunri) ? S.uni.n : null;
}

/* 共有 URL に回答が載っていれば、ここで結果画面を復元する */
RTPace.setup({ today: ()=>new Date() });

RTShare.setup({
  quiz: QUIZ,
  subject: "english",
  subjectLabel: "英語",
  state: quizState,
  showResult: ()=>{ quizState.step = activeQuizSteps().length; go("quiz"); renderQuiz(); },
  renderQuiz: ()=>renderQuiz(),
  restart: ()=>{ startQuiz(); go("quiz"); },
  route: {
    /* トークンは [種類, 志望レベル or 講師, 受験タイプ, 学習方針, 現在地] の 5 個 */
    encode: ()=>{
      if(S.mode==="sensei"){
        const s = SENSEIS.find(x=>x.id===S.sensei);
        if(!s) return null;
        return {tokens:["s", s.id, "x", "x", String(S.level)], uni:null, label:s.name};
      }
      const t = TIERS.find(x=>x.id===S.tier);
      if(!t) return null;
      const uni = sharedUniName();
      return {
        tokens:["t", t.id, S.bunri, S.policy, String(S.level)],
        uni: uni,
        label: [uni || t.name,
                S.bunri==="bun" ? "国公立二次型" : "私立個別型",
                S.policy==="omni" ? "王道網羅型" : "時短・精選型"].join(" / ")
      };
    },
    apply: (tk, uni)=>{
      if(tk.length!==5) return false;
      const level = LEVELS.indexOf(tk[4]);
      if(level<0) return false;
      /* 検証を先に済ませてから S に書く。途中で弾いたときに
         画面のボタンと S がずれた状態で残らないようにするため */
      if(tk[0]==="s"){
        if(!SENSEIS.some(x=>x.id===tk[1])) return false;
        S.level = level; S.autoLevel = null;
        syncRouteSegs(); selectSensei(tk[1]); return true;
      }
      if(tk[0]!=="t") return false;
      if(!TIERS.some(x=>x.id===tk[1]) || !ROUTES[tk[1]] || !ROUTES[tk[1]][tk[2]]) return false;
      if(POLICIES_OK.indexOf(tk[3])<0) return false;
      S.level = level; S.autoLevel = null; S.bunri = tk[2]; S.policy = tk[3];
      /* 受験タイプはトークンに載っている＝共有した人が確定させた値 */
      S.bunriConfirmed = tk[2]; S.bunriPicked = tk[2];
      syncRouteSegs();
      if(uni && applySharedUni(uni)) return true;
      selectTier(tk[1]); return true;
    },
    show: ()=>{ go("route"); focusResult("#routeOutput"); }
  }
});

/* 状態を持つ束縛は本体のあとで載せる（const / let は巻き上げの対象外のため）。自動生成 */
  try { window.S = S; } catch (e) { /* まだ宣言に達していない名前は飛ばす */ }
  try { window.QUIZ = QUIZ; } catch (e) { /* まだ宣言に達していない名前は飛ばす */ }
  try { window.SENSEIS = SENSEIS; } catch (e) { /* まだ宣言に達していない名前は飛ばす */ }
};
