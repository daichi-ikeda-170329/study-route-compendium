/**
 * 科目トップ 7 枚が共通で使う関数。**手で編集してよい。**
 *
 * 2026-09-11 まで、同じ実装が assets/js/subject-<科目>.js の 7 本に書き写してあった
 * （仕様書 5.5）。直すたびに 7 か所を同じように直す必要があり、実際に科目ごとに
 * 中身が分かれていった。ここを唯一の置き場にする。**科目の JS に写さない。**
 *
 *   ブラウザ   <script src="/assets/js/subject-common.js" defer> を subject-<科目>.js より前に置く。
 *              window.RTCommon に載る。科目の JS は `const { byDiffAsc, … } = window.RTCommon;` で受ける
 *   Node       require('assets/js/subject-common.js')。build/lib/rank.mjs と build/lib/extract.mjs が読む
 *
 * ## 科目ごとに残してある差分
 *
 * 次の 3 つは科目によって実装が違い、そろえると挙動が変わるので、その科目の JS に残してある。
 * ここの版を使うのはそれ以外の科目だけ。
 *
 *   - normQ       理科は大学名の正規化（ひらがな→カタカナ・「大学」を落とす）で、ほかの科目と別物
 *   - covLoad     国語・社会は 60×60 以下の画像も「書影なし」とみなす
 *   - coverHTML   社会は URL を属性値としてエスケープし、alt に書名を入れる
 *
 * 書影の候補の作り方はここにも無い。assets/js/cover-resolver.js が唯一の正本
 * （生成側の build/lib/cover.mjs も同じファイルを読む）。
 */
(function (global) {
  'use strict';

  /** X（旧 Twitter）のアカウント。共有ボタンの via= と twitter:site に使う。
      share.js・build/lib/extract.mjs・build/apply-site-meta.mjs はここから読む */
  var X_HANDLE = 'route_taizen';

  /* ============================================================
     新刊（評価が未了の本）
     ============================================================
     現物を読んでいないので難易度・到達目安を持たない。生成側は build/lib/newbooks.mjs が
     同じ判定を持つ。diff を持たない本を a.diff-b.diff に通すと NaN になり、
     比較子が非対称になって並び順が実行ごとに変わる */
  function isProv(b){ return !!b && b.provisional === true; }
  /* 難易度順の並びで末尾へ落とす */
  function provLast(a,b){ return (isProv(a)?1:0) - (isProv(b)?1:0); }

  /* 難易度の並び順。diff（1〜10）が同じ本は目安偏差値（下限→上限→書名）で細かく並べる。
     diff だけで並べると、同じ diff の中で「40〜55 → 〜48 → 35〜50」のように偏差値が
     前後して、画面では難易度順に見えない。生成側の build/lib/rank.mjs もこの関数を使う。 */
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

  /* 読者に見せる書名。内部略称の本はビルド時に正式名称を dn として配信している
     （build/lib/booktitle.mjs の displayName。静的ページと同じ規則）。並べ替え・検索には name を使う */
  const bookName = b => (b && (b.dn || b.name)) || "";

  /* ISBN-13 → ISBN-10（Amazon リンク・書影キー用） */
  function isbn10Of(isbn13){
    if(!isbn13 || isbn13.length!==13 || !isbn13.startsWith("978")) return null;
    const core = isbn13.slice(3,12);
    let sum = 0;
    for(let i=0;i<9;i++) sum += (10-i) * (+core[i]);
    let chk = (11 - (sum % 11)) % 11;
    return core + (chk===10 ? "X" : String(chk));
  }

  /* 志望校の検索語の正規化（全角英数→半角・空白と区切り記号を落とす）。理科は別実装（冒頭を見る） */
  function normQ(s){
    return (s||"").trim().toLowerCase()
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))
      .replace(/[ 　・,、]/g,"");
  }

  /* ============================================================
     書影と販売サイトへのリンク
     ============================================================ */
  /* 書影は Amazon が提供する商品画像URLを第一参照とし、取得できない場合は
     国立国会図書館サーチの書影API・openBD(いずれもISBNベースの公開API)を参照します。
     画像の保存・再アップロード・加工は行っていません。 */
  function coverSrcs(b){
    /* 候補の作り方は assets/js/cover-resolver.js が唯一の正本。**ここに写さない。**
       以前は 7 科目それぞれが自前の coverSrcs を持ち、中身が 4 通りに分かれていた
       （数学・情報・小論文は Amazon の 2 候補だけ、社会は 10 候補）。同じ本なのに
       科目によって表紙が出たり出なかったりしていた。
       取得元の有効・無効は assets/js/cover-policies.js（生成物）が持つ。 */
    return (global.RTCoverResolver
      ? global.RTCoverResolver.coverSrcs(b, global.RT_COVER_POLICIES)
      : []);
  }
  /**
   * Amazon の商品ページ（無ければ検索結果）。tag はアソシエイト ID（未設定なら付けない）。
   * 科目の JS では `b => RTCommon.amazonURL(b, CONFIG.amazonTag)` として使う
   */
  function amazonURL(b, tag){
    /* ルート上の枠（志望校の過去問など）は特定の商品ではない。直リンクを出すと、
       志望校が違う利用者を別大学の 1 冊へ送ってしまう。検索結果へ送る */
    if(b.recordType === "routePlaceholder"){
      const q = encodeURIComponent(b.official || b.name);
      return `https://www.amazon.co.jp/s?k=${q}` + (tag ? `&tag=${tag}` : "");
    }
    const k = b.isbn10 || b.asin;
    if(k) return `https://www.amazon.co.jp/dp/${k}/ref=nosim` + (tag ? `?tag=${tag}` : "");
    if(b.azq) return `https://www.amazon.co.jp/s?k=${encodeURIComponent(b.azq)}` + (tag ? `&tag=${tag}` : "");
    return null;
  }
  /** 楽天ブックスの検索結果。id は楽天アフィリエイト ID。未設定なら null（リンクを出さない） */
  function rakutenURL(b, id){
    if(!id) return null;
    const dest = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(b.isbn13 || b.name)}/`;
    return `https://hb.afl.rakuten.co.jp/hgc/${id}/?pc=${encodeURIComponent(dest)}&m=${encodeURIComponent(dest)}`;
  }
  function coverHTML(b){
    const n = bookName(b).length;
    const cls = n>14 ? "xlong" : (n>9 ? "long" : "");
    /* fb（書影が取れないときの代替色）は手で決める装飾。新刊はまだ持たないので既定色を当てる。
       ここを素通りさせると b.fb.bg が TypeError になり、図鑑の描画そのものが止まる */
    const fbc = b.fb || {bg:"linear-gradient(160deg,#8A8F9E,#5A6070)"};
    const fbStyle = `background:${fbc.bg}${fbc.light ? ";color:#1B2233;text-shadow:none" : ""}`;
    const fb = `<div class="bcov-fb${fbc.light ? " light" : ""}" style="${fbStyle}"><span class="fb-spine"></span><span class="fb-pub">${b.pub}</span><span class="fb-title ${cls}">${bookName(b)}</span><span class="fb-band">${b.subjects || ""}</span></div>`;
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
     画面の切り替えと履歴
     ============================================================
     画面はハッシュで指し示せる（/<科目>/#catalog など）。ポータルや外部からの直リンクの宛先になる。
     画面（views）が変わるときだけ履歴に積む（pushState）。2026-09-10 まで常に replaceState で、
     図鑑→ルート→診断と動いたあとにブラウザの「戻る」を押すと、一気にサイトの外へ出ていた（仕様書 2.3）。

     科目の JS では次のように受ける（S・起動済みフラグは科目の JS が持つので、関数で渡す）。
       const { go, syncHash, hashView, applyHash } = RTCommon.createNav({
         views: VIEWS, state: () => S, booted: () => NAV_BOOTED,
         onView: view => { … },   // 画面に入ったときの科目ごとの処理（無くてよい）
       });
     hashchange と popstate の受け手もここで付ける。 */
  function createNav(o){
    const views = o.views;
    function go(view, opts){
      const S = o.state();
      /* 起動中（ハッシュ・共有 URL の復元）と、同じ画面の中での状態変更、
         戻る/進むからの呼び出しは積まない */
      const push = o.booted() && view !== S.view && !(opts && opts.push === false);
      S.view = view;
      document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active", v.id==="view-"+view));
      document.querySelectorAll("#navDesktop button, #tabbar button").forEach(b=>{
        const on = b.dataset.view===view;
        b.classList.toggle("active", on);
        /* 見た目の色だけでなく、支援技術にも「いまここ」を伝える */
        if(on) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current");
      });
      window.scrollTo({top:0});
      if(o.onView) o.onView(view);
      syncHash(view, push);
    }
    function syncHash(view, push){
      try{
        const want = view==="home" ? "" : "#"+view;
        const url = location.pathname + location.search + want;
        if(push){ history.pushState({view: view}, "", url); return; }
        if(location.hash === want && history.state && history.state.view === view) return;
        history.replaceState({view: view}, "", url);
      }catch(e){ /* history に触れない環境では URL が追従しないだけ */ }
    }
    /** いまのハッシュが指す画面。未知のハッシュなら空文字 */
    function hashView(){
      const v = (location.hash || "").slice(1);
      return views.indexOf(v) >= 0 ? v : "";
    }
    /** ハッシュが指す画面へ移る。未知のハッシュは無視して現在の画面のままにする。
        ハッシュの変化はブラウザがすでに履歴に積んでいるので、ここでは積まない */
    function applyHash(){
      const v = hashView();
      if(v && v !== o.state().view) go(v, {push:false});
    }
    window.addEventListener("hashchange", applyHash);
    /* ブラウザの戻る/進む。積んだときの画面へ戻す（ハッシュが無い最初の項目はホーム） */
    window.addEventListener("popstate", function(e){
      const v = (e.state && e.state.view) || hashView() || "home";
      if(views.indexOf(v) >= 0 && v !== o.state().view) go(v, {push:false});
    });
    return { go, syncHash, hashView, applyHash };
  }

  /* ============================================================
     モーダルのフォーカス管理
     ============================================================
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

  const RTCommon = {
    X_HANDLE,
    isProv, provLast, hRange, byDiffAsc, byDiffDesc, diffColor, bookName, isbn10Of, normQ,
    coverSrcs, amazonURL, rakutenURL, coverHTML, covLoad, covErr,
    createNav,
    trapFocusables, modalOpened, modalClosed, openBox,
  };
  global.RTCommon = RTCommon;
  if (typeof module !== 'undefined' && module.exports) module.exports = RTCommon;
})(typeof window !== 'undefined' ? window : globalThis);
