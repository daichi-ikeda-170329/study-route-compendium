/**
 * japanese 科目トップの描画・操作コード。**手で編集してよい。**
 *
 * もとは japanese/index.html のインライン <script> にデータごと入っていた。
 * インラインのままだと HTML の解析が止まり、理科では LCP が 10 秒台になっていた。
 * build/migrate-subject.mjs が、中身を書き換えずにここへ切り出した。
 *
 * データ（BOOKS / UNIS / TIERS / ROUTES / GUIDES / STAGES / CONFIG）はここには無い。
 * 正本は data/subjects/japanese/ で、配信用は assets/generated/subjects/japanese.*.json。
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
window.catGroups = catGroups; window.isProv = isProv; window.provLast = provLast; window.hRange = hRange; window.byDiffAsc = byDiffAsc; window.byDiffDesc = byDiffDesc; window.diffColor = diffColor; window.normQ = normQ; window.searchUnis = searchUnis; window.facBunri = facBunri; window.isMed = isMed; window.resolveUni = resolveUni; window.pickBunri = pickBunri; window.levelFromHen = levelFromHen; window.levelFromDone = levelFromDone; window.moshiComparable = moshiComparable; window.recalcStatus = recalcStatus; window.targetHen = targetHen; window.renderVerdict = renderVerdict; window.go = go; window.syncHash = syncHash; window.applyHash = applyHash; window.coverSrcs = coverSrcs; window.amazonURL = amazonURL; window.rakutenURL = rakutenURL; window.coverHTML = coverHTML; window.covLoad = covLoad; window.covErr = covErr; window.buildFilters = buildFilters; window.setFilter = setFilter; window.bookCardHTML = bookCardHTML; window.renderCatalog = renderCatalog; window.findConnections = findConnections; window.openModal = openModal; window.closeModal = closeModal; window.buildRoutePicker = buildRoutePicker; window.selectTier = selectTier; window.setSubj = setSubj; window.syncMode = syncMode; window.setMode = setMode; window.sugSync = sugSync; window.sugClose = sugClose; window.renderUniSug = renderUniSug; window.pickUni = pickUni; window.subjBadge = subjBadge; window.applyUni = applyUni; window.renderDoneSug = renderDoneSug; window.addDone = addDone; window.removeDone = removeDone; window.renderDoneChips = renderDoneChips; window.segAria = segAria; window.wireSeg = wireSeg; window.subjectPlan = subjectPlan; window.nodeHTML = nodeHTML; window.renderRoute = renderRoute; window.renderRouteBody = renderRouteBody; window.renderHome = renderHome; window.startQuiz = startQuiz; window.activeQuizSteps = activeQuizSteps; window.renderQuiz = renderQuiz; window.pickOpt = pickOpt; window.nextQuiz = nextQuiz; window.focusResult = focusResult; window.renderQuizResult = renderQuizResult; window.applyQuiz = applyQuiz; window.renderGuide = renderGuide; window.toggleGuide = toggleGuide; window.trapFocusables = trapFocusables; window.modalOpened = modalOpened; window.modalClosed = modalClosed; window.openBox = openBox; window.syncRouteSegs = syncRouteSegs; window.applySharedUni = applySharedUni; window.sharedUniName = sharedUniName;


/* 診断結果の共有・保存（assets/js/share.js）。
   スクリプトを読めなかった場合でも診断が壊れないよう、何もしない実装で代替する。 */
var RTShare = (typeof RTShare !== "undefined" && RTShare) || {setup(){}, beforeQuiz:()=>"", beforeResult:()=>"", afterResult:()=>"", routeBlock:()=>"", restart(){ startQuiz(); go("quiz"); }};
/* ルートの進めるペース（assets/js/pace.js）。同じく、読めなくてもルートは出す */
var RTPace = (typeof RTPace !== "undefined" && RTPace) || {setup(){}, apply(){}};


/* 設定（CONFIG）は data/subjects/japanese/config.json が正本。
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
   DATA — 大学受験 国語 参考書データベース(2026年度入試・新課程)
   ISBNは出版社/書店DBで確認した最新版。表紙は書店DBの画像を使用し、
   取得できない場合は別ソース→プレースホルダー表紙へ自動で切替。
   sub: gendai 現代文 / kobun 古文 / kanbun 漢文 / koten 古文・漢文合冊 / sogo 国語総合
   diff: 体感難易度 1–10 / h: 完走の目安時間(概算)
   ============================================================ */

const SUBFILTER = {
  gendai:{label:"現代文", match:s=>s==="gendai"},
  kobun: {label:"古文",   match:s=>s==="kobun"||s==="koten"},
  kanbun:{label:"漢文",   match:s=>s==="kanbun"||s==="koten"},
  sogo:  {label:"国語総合・共テ", match:s=>s==="sogo"}
};

/* 図鑑の「科目別」表示のまとまり。SUBJ の宣言より前に置くので関数にしてある。
   SUBFILTER は絞り込み用で、古文と漢文の両方に koten を出すなど
   重複を許すので、セクション分けにはこちらを使う。
   ここに載らない sub の本は最後に「その他」としてまとめて出す。 */
function catGroups(){ return [
  {label:"現代文",        color:SUBJ.gendai.color, match:b=>b.sub==="gendai"},
  {label:"古文",          color:SUBJ.kobun.color,  match:b=>b.sub==="kobun"},
  {label:"漢文",          color:SUBJ.kanbun.color, match:b=>b.sub==="kanbun"},
  {label:"古文・漢文（共通）", color:SUBJ.kobun.color, match:b=>b.sub==="koten"},
  {label:"国語総合・共通テスト", color:"#3D4657",   match:b=>b.sub==="sogo"}
]; }
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
   [名称, 検索エイリアス, 国語ルートtier, 設置, 国語の到達目安(全統記述), 現代文, 古文, 漢文, 理系の二次国語, 試験時間・構成, 出題の特徴]
   古文/漢文: 1=必須 0=なし 2=学部・方式による / 理系: 0=なし 1=あり 2=医学部のみ
   ============================================================ */



/* ============================================================
   GUIDES — オリジナル学習ガイド記事(国語)
   ============================================================ */


/* ============================================================
   ROUTES — 志望レベル×科目(現代文/古文/漢文)×方針(omni=王道じっくり型 / quick=時短・精選型)
   lvl: 0 導入 / 1 基礎 / 2 標準 / 3 応用 / 4 過去問
   final: 3科目共通の仕上げ(過去問・通し演習)
   ============================================================ */

const SUBJ = {
  gendai:{label:"現代文", color:"#24427C", short:"現"},
  kobun: {label:"古文",   color:"#8C2437", short:"古"},
  kanbun:{label:"漢文",   color:"#2F6E4F", short:"漢"}
};



/* ============================================================
   QUIZ — 3分診断
   ============================================================ */
const QUIZ = [
  {q:"Q1 — 志望レベル",title:"目指すレベルは?",sub:"迷ったら少し上を選ぶのがおすすめです",key:"tier",
   opts:[
     {v:"kyote",b:"共通テストが中心",s:"理系・共テ利用・国公立1次を固めたい",ic:"M4 5h16v14H4zM4 10h16"},
     {v:"nikkoma",b:"日東駒専・産近甲龍",s:"中堅私大に確実に合格したい",ic:"M12 3 4 7v2h16V7l-8-4ZM5 11v7M12 11v7M19 11v7M3 20h18"},
     {v:"march",b:"MARCH・関関同立",s:"難関私大レベル",ic:"M12 3 4 7v2h16V7l-8-4ZM5 11v7M12 11v7M19 11v7M3 20h18"},
     {v:"chikoku",b:"地方国公立",s:"二次試験に国語の記述がある",ic:"M6 20V8l6-4 6 4v12M10 20v-6h4v6"},
     {v:"top",b:"早稲田・旧帝・東大京大・一橋",s:"最難関レベル(次の質問で細分化)",ic:"m12 2 2.9 6.3 6.9.6-5.2 4.6 1.5 6.8L12 16.7l-6.1 3.6 1.5-6.8L2.2 8.9l6.9-.6L12 2Z"}
   ]},
  {q:"Q2 — 志望の詳細",title:"最難関の中では?",sub:"国語の出題形式が大学ごとに大きく異なります",key:"tier2",cond:s=>s.tier==="top",
   opts:[
     {v:"sokei",b:"早稲田・上智",s:"長文・知識・文語文の私大最難関",ic:"M6 20V8l6-4 6 4v12M10 20v-6h4v6"},
     {v:"kyutei",b:"地方旧帝・神戸",s:"阪大・名大・東北・九大・北大",ic:"M6 20V8l6-4 6 4v12M10 20v-6h4v6"},
     {v:"top",b:"東大・京大",s:"文理とも二次に国語(高度な記述)",ic:"m12 2 2.9 6.3 6.9.6-5.2 4.6 1.5 6.8L12 16.7l-6.1 3.6 1.5-6.8L2.2 8.9l6.9-.6L12 2Z"},
     {v:"hitotsubashi",b:"一橋大",s:"近代文語文・200字要約",ic:"M4 6h16M4 12h10M4 18h7"}
   ]},
  {q:"Q3 — 必要な科目",title:"志望校で必要な科目は?",sub:"私大は漢文が不要な学部が多く、理系は共テのみが一般的です",key:"subj",
   opts:[
     {v:"all",b:"現代文・古文・漢文すべて",s:"国公立二次・早稲田の一部学部など",ic:"M4 5h16M4 12h16M4 19h16"},
     {v:"gk",b:"現代文・古文(漢文なし)",s:"多くの私立文系学部",ic:"M4 7h16M4 15h16"},
     {v:"g",b:"現代文のみ",s:"現代文だけで受験できる方式",ic:"M4 12h16"},
     {v:"kyote",b:"共通テストのみ(理系など)",s:"二次・個別に国語なし",ic:"M4 5h16v14H4zM4 10h16"}
   ]},
  {q:"Q4 — 現在地",title:"今の学力は?",sub:"「完璧にできる」レベルで正直に選ぶのがコツ",key:"level",
   opts:[
     {v:"0",b:"ゼロ〜教科書レベル",s:"古典文法・句法が怪しい。現代文は勘で解いている",ic:"M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM14 4v5h5"},
     {v:"1",b:"入試基礎は完成",s:"文法・句法・単語は一通り。基礎演習書は解ける",ic:"M5 12l4 4L19 6"},
     {v:"2",b:"入試標準まで完成",s:"MARCHレベルの問題集まで一通り終えた",ic:"M5 13l3 3 5-6 3 4 3-8"}
   ]},
  {q:"Q5 — 残り時間",title:"受験までの時間は?",sub:"学習方針(じっくり型か精選型か)を決めます",key:"time",
   opts:[
     {v:"long",b:"高1・高2(たっぷり)",s:"講義系から丁寧に積み上げられる",ic:"M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"},
     {v:"mid",b:"高3の春〜夏",s:"効率と網羅のバランス型",ic:"M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"},
     {v:"short",b:"高3の秋以降・既卒で時間がない",s:"精選型で最短ルートを取る",ic:"M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"}
   ]}
];

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
   STATE & NAV
   ============================================================ */
/* bunriConfirmed は志望校モードで本人が選んだ受験区分（文系 / 理系）。
   **学部名から黙って立てない。** 理系と判定すると二次に国語が無い前提の
   共通テストルートへ切り替わるので、推定で決めると教材列がまるごと変わる */
const S = {view:"home", tier:null, subj:"all", policy:"omni", level:0,
           mode:"tier", uni:null, fac:"", moshi:"zento", hen:null, henAdj:null,
           done:new Set(), autoLevel:null, bunriConfirmed:null, bunriPicked:null};
const bookById = id => BOOKS.find(b=>b.id===id);
const SUBJ_KEYS = ["gendai","kobun","kanbun"];

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
const RI_RE = /理|工|医|歯|薬|農|獣医|水産|情報|生命|建築|システム|海洋|航空|数|物理|化|生物|環境|技術|デザイン工|先端|材料|機械|電気|電子|土木|応用|看護|保健/;
const BUN_RE = /文|法|経済|経営|商|教育|社会|国際|外国語|人文|政治|心理|教養|観光|福祉|コミュニケーション|人間|総合/;
function facBunri(f){
  if(!f) return null;
  if(RI_RE.test(f) && !/人文|文化|情報コミュニケーション/.test(f)) return "ri";
  if(BUN_RE.test(f)) return "bun";
  return null;
}
function isMed(f){ return !!f && MED_RE.test(f) && !MED_NG_RE.test(f); }
/* 志望校+学部 → {tier, hen, need:{gendai,kobun,kanbun}, extra, label, kyoteOnly} */
function resolveUni(u, fac){
  if(!u) return null;
  let tier = u.t, hen = u.h, extra = "", kyoteOnly = false;
  /* 学部名からの判定は候補まで。確定は本人の回答（S.bunriConfirmed）だけ */
  const bunri = S.bunriConfirmed || null, med = isMed(fac);
  if(!bunri && u.g!==0){
    const sug = (typeof RTBunri!=="undefined") ? RTBunri.suggest(fac) : {bunri:null, reason:"学部・学科が未入力です"};
    return {needsBunri:true, suggestedBunri:sug.bunri, reason:sug.reason,
            tier:u.t, hen:u.h, med, label:u.n + (fac ? " " + fac.trim() : "")};
  }
  if(u.g===0){
    tier = "kyote"; kyoteOnly = true;
    extra = "この大学の個別試験に国語はありません。共通テスト国語(または小論文)の対策に絞ります。";
  } else if(bunri==="ri"){
    if(u.ri===1){ extra = "理系学部ですが、この大学は二次試験に国語が課されます。"; }
    else if(u.ri===2 && med){ extra = "医学部医学科は二次試験に国語が課されます。"; }
    else { tier = "kyote"; kyoteOnly = true; extra = "理系学部は二次・個別試験に国語がないため、共通テスト国語ルートに切り替えています。"; }
  }
  if(tier==="kyote" && !kyoteOnly && u.t==="kyote") kyoteOnly = true;
  const need = kyoteOnly ? {gendai:1,kobun:1,kanbun:1} : {gendai:1, kobun:u.k, kanbun:u.kan};
  return {tier, hen, need, extra, kyoteOnly, label:u.n + (fac ? " " + fac.trim() : "")};
}

/** 受験区分の確認ボタンから呼ばれる。"bun" / "ri" / "unknown" */
function pickBunri(v){
  S.bunriPicked = v;
  S.bunriConfirmed = (v==="bun"||v==="ri") ? v : null;
  applyUni();
}

/* ============================================================
   学習状況 → 現在地の推定
   ============================================================ */
const STAGE_LV = {intro:0, know:0, core:1, kyotest:1, std:2, adv:3, kako:3};
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
    const v = STAGE_LV[b.stage] ?? 0;
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
  const t = TIERS.find(x=>x.id===S.tier);
  if(!t) return null;
  const m = (t.hensachi||"").match(/(\d+)\s*〜\s*(\d+)/);
  return m ? +m[2] : null;
}
function renderVerdict(){
  const el = document.getElementById("statusVerdict");
  if(S.henAdj==null && S.done.size===0){ el.classList.remove("on"); el.innerHTML=""; return; }
  const tgt = targetHen();
  const LVN = ["ゼロ〜教科書","入試基礎まで完成","入試標準まで完成","応用まで完成"];
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
    <b>この情報をルートに反映しました。</b>${S.done.size?`登録した${S.done.size}冊は<b style="color:var(--ok)">習得済み</b>として表示し、`:""}現在地より下の段階は「スキップ可」として薄く表示しています。${S.henAdj!=null&&tgt&&S.henAdj>=tgt?"すでに目標水準に届いているので、過去問演習と弱点科目の補強を主軸にしてください。":"各科目の「▶ ここから」と表示された1冊から着手してください。科目ごとの得点率に差があれば、弱い科目の段階を手動で下げて構いません。"}`;
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
   COVERS — 実表紙画像(Amazon→国立国会図書館→Google Books→openBD)+自動フォールバック
   ============================================================ */
/* 書影は Amazon が提供する商品画像URLを第一に参照し(Amazonアソシエイト・ヘルプ
   「Amazonが提供している商品画像URLを指定する形でご利用ください」に準拠)、取得できない場合のみ
   公開書誌データベース(国立国会図書館サーチ / Google Books / openBD)の書影URLを順に参照します。
   画像の保存・再アップロード・加工は行っていません。全ソースで取得できない場合は
   書名入りのプレースホルダー表紙を生成して表示します(表紙が空になることはありません)。 */
function coverSrcs(b){
  /* 候補の作り方は assets/js/cover-resolver.js が唯一の正本。**ここに写さない。**
     以前は 7 科目それぞれが自前の coverSrcs を持ち、中身が 4 通りに分かれていた
     （数学・情報・小論文は Amazon の 2 候補だけ、社会は 10 候補）。同じ本なのに
     科目によって表紙が出たり出なかったりしていた。
     取得元の有効・無効は assets/js/cover-policies.js（生成物）が持つ。 */
  return (window.RTCoverResolver
    ? window.RTCoverResolver.coverSrcs(b, window.RT_COVER_POLICIES)
    : []);
}
/* ---------- アフィリエイトリンク ---------- */
function amazonURL(b){
  /* ルート上の枠（志望校の過去問など）は特定の商品ではない。直リンクを出すと、
     志望校が違う利用者を別大学の 1 冊へ送ってしまう。検索結果へ送る */
  if(b.recordType === "routePlaceholder"){
    const q = encodeURIComponent(b.official || b.name);
    return `https://www.amazon.co.jp/s?k=${q}` + (CONFIG.amazonTag ? `&tag=${CONFIG.amazonTag}` : "");
  }
  const k = b.isbn10 || b.asin; if(!k) return null;
  return `https://www.amazon.co.jp/dp/${k}/ref=nosim` + (CONFIG.amazonTag ? `?tag=${CONFIG.amazonTag}` : "");
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
function covLoad(img){ if(img.naturalWidth<=1 || (img.naturalWidth<=60 && img.naturalHeight<=60)) covErr(img); else img.closest(".bcov").classList.add("ok"); }
function covErr(img){
  const srcs = (img.dataset.srcs||"").split("|");
  const next = (+img.dataset.s) + 1;
  if(next < srcs.length){ img.dataset.s = String(next); img.src = srcs[next]; }
  else { img.classList.add("hide"); const w = img.closest(".bcov"); if(w) w.classList.add("fb"); }
}

/* ============================================================
   CATALOG
   ============================================================ */
let catStage="all", catSub="all";
function buildFilters(){
  const fs = document.getElementById("filterScroll");
  let h = `<button class="chip active" data-k="sub" data-v="all" onclick="setFilter('sub','all',this)">全科目</button>`;
  for(const k in SUBFILTER) h += `<button class="chip" data-k="sub" data-v="${k}" onclick="setFilter('sub','${k}',this)">${SUBFILTER[k].label}</button>`;
  h += `<span style="flex:none;width:1px;background:var(--line-d);margin:2px 4px"></span>`;
  h += `<button class="chip active" data-k="stage" data-v="all" onclick="setFilter('stage','all',this)">全段階</button>`;
  for(const k in STAGES) h += `<button class="chip" data-k="stage" data-v="${k}" onclick="setFilter('stage','${k}',this)">${STAGES[k].label}</button>`;
  fs.innerHTML = h;
}
function setFilter(k,v,btn){
  if(k==="stage") catStage=v; else catSub=v;
  document.querySelectorAll(`.chip[data-k="${k}"]`).forEach(c=>c.classList.toggle("active", c.dataset.v===v));
  renderCatalog();
}
/* 絞り込みの結果が 0 件のときに出す。空文字だと前の結果が残って見える */
const EMPTY_HTML = `<div class="cat-empty">条件に合う参考書がありません。絞り込みを緩めてください。</div>`;

/* 図鑑・検索結果に並べる 1 枚のカード。セクション表示と通常表示で共有する */
function bookCardHTML(b){
  const st = STAGES[b.stage];
  const sc = SUBJ[b.sub] ? SUBJ[b.sub].color : "#3D4657";
  const dots = isProv(b) ? "" : Array.from({length:10},(_,i)=>`<i style="${i<b.diff?`background:${diffColor(b.diff)}`:""}"></i>`).join("");
  return `<div class="book-card" role="button" tabindex="0" onclick="openModal('${b.id}')">
    <div class="book-card__cover">${coverHTML(b)}</div>
    <div class="book-card__body">
      <div class="bc-name">${b.name}</div>
      <div class="bc-pub">${b.pub}</div>
      <div class="bc-diff"><span class="diff-dots">${dots}</span></div>
      <div class="bc-hensachi">${isProv(b) ? `<span class="bc-prov">${PROV_LABEL}</span>` : `目安 <b>${b.hensachi}</b>`}</div>
      <div class="bc-tags"><span class="tag tag-stage" style="background:${st.color}">${st.short}</span>${b.subjects ? `<span class="tag" style="background:${sc}1A;color:${sc}">${b.subjects}</span>` : ""}</div>
    </div>
  </div>`;
}

function renderCatalog(){
  const q = (document.getElementById("book-search").value||"").trim().toLowerCase();
  const sort = document.getElementById("sortSel").value;
  let list = BOOKS.filter(b=>{
    if(catStage!=="all" && b.stage!==catStage) return false;
    if(catSub!=="all" && !SUBFILTER[catSub].match(b.sub)) return false;
    if(q){
      const hay = (b.name+b.official+b.pub+b.desc+b.subjects+b.style+(b.unis||[]).join(" ")).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  document.getElementById("catCount").textContent = list.length;
  const grid = document.getElementById("bookGrid");
  if(sort==="field"){
    /* 科目別（現代文・物理・日本史 …）→ 役割別 → 難易度順。
       共通テストと過去問は役割なので、科目ごとに独立したまとまりになる。 */
    let html = "";
    let rest = list.slice();
    const draw = (label, color, books) => {
      if(!books.length) return "";
      let h = `<div class="cat-grp" style="--gc:${color}">${label}<small>${books.length} BOOKS</small></div>`;
      for(const k in STAGES){
        const g = books.filter(b=>b.stage===k).sort(byDiffAsc);
        if(!g.length) continue;
        h += `<div class="cat-sec" style="--sc:${STAGES[k].color}">${STAGES[k].label}<small>${g.length} BOOKS — やさしい順</small></div>`;
        h += g.map(bookCardHTML).join("");
      }
      return h;
    };
    for(const grp of catGroups()){
      const inG = rest.filter(grp.match);
      if(!inG.length) continue;
      rest = rest.filter(b=>!grp.match(b));
      html += draw(grp.label, grp.color, inG);
    }
    /* どのまとまりにも入らない本を落とさない。増えたら catGroups() に足す */
    html += draw("その他", "#3D4657", rest);
    grid.innerHTML = html || EMPTY_HTML;
    return;
  }
  if(sort==="diff-asc") list.sort(byDiffAsc);
  else if(sort==="diff-desc") list.sort(byDiffDesc);
  else if(sort==="year") list.sort((a,b)=>b.year-a.year);
  else list.sort((a,b)=>a.name.localeCompare(b.name,"ja"));
  grid.innerHTML = list.map(bookCardHTML).join("") || EMPTY_HTML;
}

/* ============================================================
   MODAL
   ============================================================ */
function findConnections(id){
  const prev=new Set(), next=new Set();
  for(const t in ROUTES){
    for(const sk of SUBJ_KEYS){
      const g = ROUTES[t][sk]; if(!g) continue;
      for(const pol of ["omni","quick"]){
        const seq = g[pol]||[];
        seq.forEach((s,i)=>{
          if(s.id===id){
            if(i>0) prev.add(seq[i-1].id);
            if(i<seq.length-1) next.add(seq[i+1].id);
          }
        });
      }
    }
  }
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
    <a class="detail-btn" href="/japanese/books/${b.id}/">
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
  const sc = SUBJ[b.sub] ? SUBJ[b.sub].color : "#3D4657";
  document.getElementById("modalInner").innerHTML = `
    <div class="modal__grab"></div>
    <div class="modal__head">
      <div class="modal__cover">${coverHTML(b)}</div>
      <div class="modal__titles">
        <span class="tag tag-stage modal__stage" style="background:${st.color}">${st.label}</span>
        <span class="tag modal__stage" style="background:${sc}1A;color:${sc};margin-left:4px">${b.subjects}</span>
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
    <button class="rpick${S.tier===t.id?" sel":""}" style="--tc:${t.color}" onclick="selectTier('${t.id}')">
      <span class="rpick__no">ROUTE ${t.no}</span>
      <b>${t.name}</b><span>${t.sub}</span>
    </button>`).join("");
}
function selectTier(id){
  S.tier=id; S.mode="tier"; S.uni=null;
  syncMode(); buildRoutePicker(); renderVerdict(); renderRoute();
}
function setSubj(s){
  S.subj = s;
  document.querySelectorAll("#subjBar .sbtn").forEach(b=>b.classList.toggle("on", b.dataset.s===s));
  renderRoute();
}

/* ---------- mode switch ---------- */
function syncMode(){
  document.querySelectorAll(".mtab").forEach(b=>b.classList.toggle("on", b.dataset.m===S.mode));
  document.getElementById("modeTier").style.display = S.mode==="tier" ? "" : "none";
  document.getElementById("modeUni").style.display  = S.mode==="uni"  ? "" : "none";
}
function setMode(m){
  S.mode = m; syncMode();
  if(m==="uni"){ applyUni(); document.getElementById("uniInput").focus(); }
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
function subjBadge(k, v, kyoteOnly){
  const L = SUBJ[k].label;
  if(kyoteOnly) return `<span class="some">${L}:共テのみ</span>`;
  if(v===1) return `<span class="req">${L}:必要</span>`;
  if(v===2) return `<span class="some">${L}:学部・方式による</span>`;
  return `<span class="no">${L}:二次なし</span>`;
}
function applyUni(){
  const box = document.getElementById("uniResult");
  if(!S.uni){
    box.innerHTML = `<div class="note-card info" style="margin-top:4px"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><p>大学名と学部を手がかりに、登録済みの出題科目（現代文・古文・漢文の有無）と到達目安からルートを提案します。受験する区分（文系 / 理系）は最後に確認します。大学・学部・入試方式によって必要科目は異なるため、出願時は公式募集要項を確認してください。</p></div>`;
    document.getElementById("routeOutput").innerHTML = "";
    return;
  }
  const r = resolveUni(S.uni, S.fac);
  if(r.needsBunri){
    /* 文系か理系かで二次に国語があるかが変わる。決まるまではルートを出さない */
    const t0 = TIERS.find(x=>x.id===r.tier);
    document.getElementById("routeOutput").innerHTML = "";
    box.innerHTML = `
      <div class="uni-card" style="--tc:${t0.color}">
        <div class="uni-card__top"><h4>${r.label}</h4><span>${S.uni.ty} ・ 国語の到達目安 偏差値 ${r.hen}</span></div>
        <div class="uni-card__map"><span class="tag">${t0.name} ルート</span><span class="arw">/</span><span>受験区分は未確認</span></div>
        <div class="uni-card__note"><b>試験構成:</b> ${S.uni.time}<br><b>国語の出題傾向:</b> ${S.uni.no}</div>
      </div>
      ${typeof RTBunri!=="undefined"
        ? RTBunri.promptHTML({kind:"course", suggested:r.suggestedBunri, reason:r.reason,
                              handler:"pickBunri", picked:S.bunriPicked})
        : `<div class="bnr"><p class="bnr-lead">受験する区分（文系 / 理系）が分かるとルートを表示できます。</p></div>`}`;
    return;
  }
  S.tier = r.tier;
  const t = TIERS.find(x=>x.id===r.tier);
  box.innerHTML = `
    <div class="uni-card" style="--tc:${t.color}">
      <div class="uni-card__top"><h4>${r.label}</h4><span>${S.uni.ty} ・ 国語の到達目安 偏差値 ${r.hen}</span></div>
      <div class="uni-card__map">
        <span class="tag">${t.name} ルート</span><span class="arw">/</span>
        <span>${S.policy==="omni"?"王道じっくり型":"時短・精選型"}</span>
      </div>
      <div class="uni-card__subj">${SUBJ_KEYS.map(k=>subjBadge(k, r.need[k], r.kyoteOnly)).join("")}</div>
      <div class="uni-card__note"><b>試験構成:</b> ${S.uni.time}<br><b>国語の出題傾向:</b> ${S.uni.no}${r.extra?`<br><b style="color:var(--indigo-deep)">判定:</b> ${r.extra}`:""}</div>
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
    if(cb) cb();
  });
}
/* 科目ごとの実際のルート列を決める(志望校で不要な科目は共テルートに差し替え) */
function subjectPlan(tierId, sk, need){
  const base = ROUTES[tierId][sk][S.policy];
  if(need===1 || tierId==="kyote") return {seq:base, para:ROUTES[tierId].para[sk]||[], note:null};
  if(need===0){
    return {seq:ROUTES.kyote[sk][S.policy], para:ROUTES.kyote.para[sk]||[],
      note:`<b>この大学の二次・個別試験では${SUBJ[sk].label}は出題されません。</b>共通テストで必要なレベルまでのルートに差し替えています(共テ利用がなければ省略可)。`};
  }
  return {seq:base, para:ROUTES[tierId].para[sk]||[],
    note:`<b>${SUBJ[sk].label}の有無は学部・方式によって異なります。</b>志望学部の入試要項で出題範囲を確認し、不要なら共通テストレベルまでで止めてください。`};
}
const LVL_NAME = ["導入","基礎","標準","応用","過去問"];
function nodeHTML(s, i, st0, startIdx, b, extraCls){
  const skip = st0!=="todo";
  const cls = st0==="done" ? " done" : (st0==="skip" ? " skip" : (i===startIdx ? " active start" : " active"));
  const badge = st0==="done"
    ? `<span class="node-badge done">習得済み</span>`
    : (st0==="skip" ? `<span class="skip-badge">スキップ可</span>`
    : (i===startIdx ? `<span class="node-badge start">▶ ここから</span>` : ""));
  const st = STAGES[b.stage];
  const altHtml = s.alts && s.alts.length ? `<div class="cn-info__alt"><b>代替:</b> ${s.alts.map(a=>{
    const ab=bookById(a); return `<button onclick="event.stopPropagation();openModal('${a}')">${ab.name}</button>`;
  }).join(" / ")}</div>` : "";
  return `<div class="climb-node${cls}${extraCls||""}" data-book-id="${b.id}" data-subject-id="japanese" data-h="${b.h}" data-hours="${String(b.hours||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;")}">
    <div class="cn-marker"><div class="cn-step">${st0==="done"?"✓":i+1}</div><div class="cn-lvl">${LVL_NAME[s.lvl]}</div></div>
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
  if(!S.tier){
    out.innerHTML = `<div class="route-empty">
      <svg width="46" height="46" viewBox="0 0 24 24" fill="none"><path d="M6 20v-5a3 3 0 0 1 3-3h6a3 3 0 0 0 3-3V4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="6" cy="20" r="2" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="4" r="2" stroke="currentColor" stroke-width="1.6"/></svg>
      <p>上から志望レベルを選ぶと、現代文・古文・漢文のルートが表示されます</p></div>`;
    return;
  }
  const tier = TIERS.find(t=>t.id===S.tier);
  const R = ROUTES[S.tier];
  const uniR = (S.mode==="uni" && S.uni) ? resolveUni(S.uni, S.fac) : null;
  const need = uniR ? uniR.need : {gendai:1,kobun:1,kanbun:1};
  const bound = [0,2,3,4][S.level];
  const shown = S.subj==="all" ? SUBJ_KEYS : [S.subj];
  let active=0, hours=0, books=0;
  const stateOf = s => S.done.has(s.id) ? "done" : ((s.lvl < bound && s.lvl < 4) ? "skip" : "todo");

  const sections = shown.map(sk=>{
    const plan = subjectPlan(S.tier, sk, need[sk]);
    const seq = plan.seq;
    const state = seq.map(stateOf);
    const startIdx = state.indexOf("todo");
    let sHours=0, sActive=0;
    const nodes = seq.map((s,i)=>{
      const b = bookById(s.id);
      if(state[i]==="todo"){ sActive++; sHours += b.h; }
      return nodeHTML(s, i, state[i], startIdx, b);
    }).join("");
    active += sActive; hours += sHours; books += seq.length;
    const paraHtml = plan.para.length ? `
      <div class="para-head"><div class="para-head__spacer"></div><b>‖ ${SUBJ[sk].label}と並行して進める</b></div>
      ${plan.para.map(p=>{
        const b = bookById(p.id); const st = STAGES[b.stage];
        return `<div class="climb-node para" data-book-id="${b.id}" data-subject-id="japanese">
          <div class="cn-marker"><div class="cn-step">並行</div></div>
          <div class="cn-card" onclick="openModal('${b.id}')">
            <div class="cn-card__cover">${coverHTML(b)}</div>
            <div class="cn-info">
              <span class="cn-info__role" style="background:${st.color}">${st.label}</span>
              <h4>${b.name}</h4>
              <div class="cn-info__note">${p.note}</div>
              ${p.alts&&p.alts.length?`<div class="cn-info__alt"><b>代替:</b> ${p.alts.map(a=>{const ab=bookById(a);return `<button onclick="event.stopPropagation();openModal('${a}')">${ab.name}</button>`;}).join(" / ")}</div>`:""}
            </div>
          </div>
        </div>`;
      }).join("")}` : "";
    return `
      <div class="subj-head" style="--sc:${SUBJ[sk].color}">
        <div class="subj-head__spacer"><div class="subj-head__mark">${SUBJ[sk].short}</div></div>
        <div class="subj-head__ttl"><h4>${SUBJ[sk].label}ルート</h4><span>${sActive} 冊 ・ 約 ${sHours}h</span><span class="sh-meta">${S.policy==="omni"?"OMNI":"QUICK"} / ${seq.length} STEPS</span></div>
      </div>
      ${plan.note?`<div class="subj-note-row"><div class="para-head__spacer"></div><div class="subj-note">${plan.note}</div></div>`:""}
      ${nodes}
      ${paraHtml}`;
  }).join("");

  /* 仕上げ(全科目共通) */
  const fin = R.final || [];
  let finHtml = "";
  if(fin.length){
    const finNodes = fin.map((s,i)=>{
      const b = bookById(s.id);
      const st0 = S.done.has(s.id) ? "done" : "todo";
      if(st0==="todo"){ active++; hours += b.h; }
      books++;
      return nodeHTML({...s, role:"仕上げ", lvl:4}, i, st0, -1, b);
    }).join("");
    finHtml = `
      <div class="subj-head" data-final="1" style="--sc:#3D4657">
        <div class="subj-head__spacer"><div class="subj-head__mark">終</div></div>
        <div class="subj-head__ttl"><h4>仕上げ・過去問(3科目共通)</h4><span>${fin.length} 冊</span></div>
      </div>
      ${finNodes}`;
  }

  const months = Math.max(1, Math.round(hours/60));
  const uniNote = uniR
    ? `<div class="note-card info"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.4" stroke="currentColor" stroke-width="1.8"/></svg><p><b>${uniR.label}に合わせて調整しています</b>（必要な科目と志望レベルを判定し、そのレベルのルートを出しています）。${S.uni.time}。${uniR.extra||""}過去問の段は志望校の赤本に読み替えて進めてください。</p></div>`
    : "";
  const polNote = S.policy==="omni"
    ? "王道じっくり型:講義系で読み方の型を作り、段差の小さい演習書を順に積み上げる、時間のある高1・高2や浪人生向けの盤石ルートです。知識系(単語・文法・句法・漢字)は並行枠で毎日回すのが鉄則。"
    : "時短・精選型:冊数を絞って最短で志望校レベルに到達する、高3からの巻き返しに強いルートです。1冊を完璧にしてから次へ進むこと。漢文→古文→現代文の順に仕上がるので、短期で伸びる科目から固めて自信を作りましょう。";
  const subjLabel = S.subj==="all" ? "現代文・古文・漢文" : SUBJ[S.subj].label;
  out.innerHTML = `
    <div class="route-summary">
      <dl style="display:contents">
        <div class="rs-item"><dt>残りの教材</dt><dd>${active}<small> 冊</small></dd></div>
        <div class="rs-item"><dt>残り目安時間</dt><dd>${hours>=1000?(hours/1000).toFixed(1)+"k":hours}<small> h</small></dd></div>
        <div class="rs-item"><dt>目安期間</dt><dd>${months}<small> か月〜</small></dd></div>
        <div class="rs-item"><dt>到達目安</dt><dd style="font-size:13px;line-height:1.4;padding-top:3px">${uniR?"偏差値 "+uniR.hen:tier.hensachi}</dd></div>
      </dl>
      <div class="rs-goal"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 21V4m0 0h11l-2.5 4L17 12H6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>目標:<b>${uniR?uniR.label+" 合格":tier.goal}</b> — ${subjLabel} / ${S.policy==="omni"?"王道じっくり型":"時短・精選型"}</div>
    </div>
    ${uniNote}
    <div class="climb">
      <div class="climb__rail"></div>
      <div class="climb__fill" style="height:100%"></div>
      ${sections}
      ${finHtml}
      <div class="climb-goal">
        <div class="cg-marker"><div class="cg-flag"><svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M6 21V4m0 0h11l-2.5 4L17 12H6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>
        <div class="cg-card"><h4>${uniR?uniR.label+" 合格":tier.goal}</h4><p>${tier.name}(${subjLabel})ルート完走。過去問で合格点を安定させたら完成です。</p></div>
      </div>
    </div>
    <div class="note-card info"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><p>${polNote}</p></div>
    <div class="note-card"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 16h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><p><b>進め方の原則:</b>3科目を同時に同じペースで進める必要はありません。漢文は数週間、古文は数か月、現代文は半年単位で伸びる科目です。次の1冊に進む前に、今の1冊を「初見の問題でも型どおりに読める・解ける」状態まで完成させること。カードを押すと各書の詳細・代替書を確認できます。</p></div>`;
}

/* ============================================================
   HOME
   ============================================================ */
function renderHome(){
  document.getElementById("stat-books").textContent = BOOKS.length;
  document.getElementById("stat-unis").textContent = UNIS.length;
  document.getElementById("lead-count").textContent = BOOKS.length;
  document.getElementById("cat-lead-count").textContent = BOOKS.length;
  document.getElementById("homeRoutes").innerHTML = TIERS.map(t=>{
    const seqs = SUBJ_KEYS.map(k=>ROUTES[t.id][k].omni);
    const total = seqs.reduce((a,s)=>a+s.length,0) + (ROUTES[t.id].final||[]).length;
    return `<div class="rp-card" style="--tc:${t.color}" role="button" tabindex="0" onclick="selectTier('${t.id}');go('route')">
      <div class="rp-card__no"><span>ROUTE ${t.no}</span><em>${total} STEPS</em></div>
      <h3>${t.name}</h3><p>${t.sub} — ${t.goal}</p>
    </div>`;
  }).join("");
  const disc = `<b>ご利用にあたって:</b>本サイトの難易度・到達偏差値・目安時間は、各出版社の公表情報と、大手予備校・塾が公開する学習ルート解説をもとにした<b>目安</b>です。効果には個人差があります。大学ごとの出題科目(古文・漢文の有無、記述の形式)は編集時点の公開情報にもとづく目安であり、必ず最新の入試要項でご確認ください。2025年入試からの新課程(共通テスト国語の90分・5題化など)により、旧課程版参考書の買い替えにはご注意ください。書影はAmazonおよび公開書誌データベースが提供する商品画像URLを参照して表示しています(画像の保存・加工は行っていません)。${AFF?"当サイトはアフィリエイト広告を利用しています。":""}`;
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
  let tier = (a.tier==="top" && a.tier2) ? a.tier2 : a.tier;
  if(a.subj==="kyote") tier = "kyote";
  const subjSel = a.subj==="g" ? ["gendai"] : (a.subj==="gk" ? ["gendai","kobun"] : SUBJ_KEYS);
  const policy = a.time==="long" ? "omni" : a.time==="short" ? "quick" : (["kyote","nikkoma"].includes(tier) ? "quick" : (+a.level>=1 ? "omni" : "quick"));
  const level = +a.level;
  const t = TIERS.find(x=>x.id===tier);
  const polLabel = policy==="omni" ? "王道じっくり型" : "時短・精選型";
  const bound = [0,2,3][level];
  /* 現在地が高いと、その科目のルートが丸ごとスキップ対象になって空になることがある。
     その場合は「次にやることが無い」のではなく「仕上げに進む段階」なので、
     ルートの最後に置いてある過去問を代わりに提示する。 */
  const fin = ROUTES[tier].final || [];
  const firsts = subjSel.map(k=>{
    const seq = ROUTES[tier][k][policy].filter(s=>!(s.lvl<bound && s.lvl<4));
    return {k, seq, first: seq[0], done: seq.length===0, fin: seq.length ? null : fin[0]};
  });
  const allDone = firsts.every(f=>f.done);
  const totalBooks = firsts.reduce((n,f)=>n+f.seq.length,0) + fin.length;
  const subjTxt = subjSel.map(k=>SUBJ[k].label).join("・");
  document.getElementById("quizShell").innerHTML = `
    ${RTShare.beforeResult()}
    <div class="quiz-progress">${activeQuizSteps().map(()=>`<span class="qp-seg done"></span>`).join("")}</div>
    <div class="quiz-step">
      <div class="result-hero">
        <div class="rh-label">DIAGNOSIS COMPLETE — あなたにおすすめのルート</div>
        <h3>${t.name}<br><span style="font-size:16px;opacity:.85">${subjTxt} × ${polLabel}</span></h3>
        <p>${allDone
          ? `選んだ現在地では、このレベルの教材はひととおり終えている段階です。ここからは志望校の過去問演習を主軸にして、出題形式に合わせた仕上げに進んでください。`
          : `メイン教材 ${totalBooks} 冊(${subjSel.length}科目+仕上げ)。${policy==="omni"?"講義系で型を作り、段差の小さい演習書を積み上げる王道の道筋です。":"精選された教材で最短距離を取る、巻き返しに強い道筋です。"}現在の学力に合わせて${level>0?"習得済みの段階はスキップ表示になります。":"導入から丁寧に始めます。"}`}</p>
      </div>
      <div class="opt-list" style="margin-top:14px">
        ${allDone
          ? (fin.map(s=>{
              const b=bookById(s.id); if(!b) return "";
              const st=STAGES[b.stage];
              return `<button class="opt" onclick="openModal('${b.id}')">
                <span class="opt__ic mono" style="font-size:13px;font-weight:700;background:var(--ink);color:#fff">仕</span>
                <span class="opt__cov">${coverHTML(b)}</span>
                <span class="opt__txt"><b>${b.name}</b><span>${subjTxt}の仕上げ ・ ${st.label} ・ ${b.hours}</span></span>
              </button>`;}).join("")
             || `<div class="opt" style="pointer-events:none;background:var(--surface-2)">
                <span class="opt__ic mono" style="font-size:13px;font-weight:700;background:var(--ink);color:#fff">仕</span>
                <span class="opt__txt"><b>過去問演習の段階です</b><span>${subjTxt}のルートは完了。志望校の過去問に進んでください</span></span>
              </div>`)
          : firsts.map(f=>{
              const pick = f.first || f.fin;
              const b = pick ? bookById(pick.id) : null;
              if(!b) return `<div class="opt" style="pointer-events:none;background:var(--surface-2)">
                <span class="opt__ic mono" style="font-size:13px;font-weight:700;background:${SUBJ[f.k].color};color:#fff">${SUBJ[f.k].short}</span>
                <span class="opt__txt"><b>${SUBJ[f.k].label}は仕上げ段階です</b><span>このレベルの教材は完了。過去問演習に進んでください</span></span>
              </div>`;
              const st=STAGES[b.stage];
              return `<button class="opt" onclick="openModal('${b.id}')">
                <span class="opt__ic mono" style="font-size:13px;font-weight:700;background:${SUBJ[f.k].color};color:#fff">${SUBJ[f.k].short}</span>
                <span class="opt__cov">${coverHTML(b)}</span>
                <span class="opt__txt"><b>${b.name}</b><span>${f.done?`${SUBJ[f.k].label}は仕上げ段階`:`${SUBJ[f.k].label}の1冊目`} ・ ${st.label} ・ ${b.hours}</span></span>
              </button>`;}).join("")}
        <div style="text-align:center;color:var(--muted);font-size:12px;font-weight:600">${allDone?"… 過去問の詳細と併用できる教材はルート画面で":"… 各科目の続きと仕上げの過去問はルート画面で"}</div>
      </div>
      <div class="quiz-nav">
        <button class="btn btn-back" onclick="RTShare.restart()">やり直す</button>
        <button class="btn btn-primary" onclick="applyQuiz('${tier}','${subjSel.length===3?"all":subjSel.length===1?"gendai":"gk"}','${policy}',${level})">
          ルート全体を見る
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      ${RTShare.afterResult({tier:t.name, variant:subjTxt, policy:polLabel})}
    </div>`;
  focusResult("#quizShell .result-hero");
}
function applyQuiz(tier,subj,policy,level){
  S.tier=tier; S.policy=policy; S.level=level; S.mode="tier"; S.uni=null; syncMode();
  S.subj = subj==="all" ? "all" : (subj==="gendai" ? "gendai" : "all");
  document.querySelectorAll("#subjBar .sbtn").forEach(b=>b.classList.toggle("on", b.dataset.s===S.subj));
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

/** 学習方針・現在地のセグメントを S に合わせる */
function syncRouteSegs(){
  document.querySelectorAll("#segPolicy button").forEach(b=>b.classList.toggle("on", b.dataset.v===S.policy));
  document.querySelectorAll("#segLevel button").forEach(b=>b.classList.toggle("on", +b.dataset.v===S.level));
  document.querySelectorAll("#subjBar .sbtn").forEach(b=>b.classList.toggle("on", b.dataset.s===S.subj));
}
/** 共有 URL で指定された大学を UNIS から引き当てて、志望校モードにする */
function applySharedUni(name){
  const u = UNIS.find(x=>x.n===name);
  if(!u) return false;
  S.uni=u; S.fac=""; S.mode="uni";
  document.getElementById("uniInput").value = u.n;
  syncMode(); applyUni();
  return true;
}


/**
 * 共有 URL に大学名（ru）を載せてよいかを判定し、載せてよいときだけ名前を返す。
 *
 * 共有 URL は学部名を持たない（個人が特定されうるため）。受け取り側は大学名から
 * 判定をやり直すので、学部や受験区分で結果が変わる大学では、**元の結果と違う
 * 教材列が出る**。ここでは共有先と同じ初期状態（受験区分は未確定）で解き直し、
 * 同じ結果にならないときは大学名を載せない。載せないときはラベルも志望レベル名に
 * なるので、大学名・学部名は共有文にも出ない。
 */
function sharedUniName(){
  if(!(S.mode==="uni" && S.uni)) return null;
  const keep = S.bunriConfirmed;
  S.bunriConfirmed = null;   /* 共有先は受験区分が未確定の状態で開く */
  let r = null;
  try { r = resolveUni(S.uni, ""); } catch(e){ r = null; } finally { S.bunriConfirmed = keep; }
  if(!r || r.needsBunri) return null;
  if(r.tier !== S.tier) return null;

  return S.uni.n;
}

/* 共有 URL に回答が載っていれば、ここで結果画面を復元する */
RTPace.setup({ today: ()=>new Date() });

RTShare.setup({
  quiz: QUIZ,
  subject: "japanese",
  subjectLabel: "国語",
  state: quizState,
  showResult: ()=>{ quizState.step = activeQuizSteps().length; go("quiz"); renderQuiz(); },
  renderQuiz: ()=>renderQuiz(),
  restart: ()=>{ startQuiz(); go("quiz"); },
  route: {
    /* トークンは [種類, 志望レベル, 表示する分野, 学習方針, 現在地] の 5 個 */
    encode: ()=>{
      const t = TIERS.find(x=>x.id===S.tier);
      if(!t) return null;
      const uni = sharedUniName();
      return {
        tokens:["t", t.id, S.subj, S.policy, String(S.level)],
        uni: uni,
        label: [uni || t.name,
                S.subj==="all" ? "現代文・古文・漢文" : SUBJ[S.subj].label,
                S.policy==="omni" ? "王道網羅型" : "時短・精選型"].join(" / ")
      };
    },
    apply: (tk, uni)=>{
      if(tk.length!==5 || tk[0]!=="t") return false;
      const level = LEVELS.indexOf(tk[4]);
      if(level<0) return false;
      if(!TIERS.some(x=>x.id===tk[1]) || !ROUTES[tk[1]]) return false;
      if(tk[2]!=="all" && SUBJ_KEYS.indexOf(tk[2])<0) return false;
      if(POLICIES_OK.indexOf(tk[3])<0) return false;
      S.level = level; S.autoLevel = null; S.subj = tk[2]; S.policy = tk[3];
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
  try { window.SUBJ = SUBJ; } catch (e) { /* まだ宣言に達していない名前は飛ばす */ }
  try { window.SUBJ_KEYS = SUBJ_KEYS; } catch (e) { /* まだ宣言に達していない名前は飛ばす */ }
};
