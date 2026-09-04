/**
 * joho 科目トップの描画・操作コード。**手で編集してよい。**
 *
 * もとは joho/index.html のインライン <script> にデータごと入っていた。
 * インラインのままだと HTML の解析が止まり、理科では LCP が 10 秒台になっていた。
 * build/migrate-subject.mjs が、中身を書き換えずにここへ切り出した。
 *
 * データ（BOOKS / UNIS / TIERS / ROUTES / GUIDES / STAGES / CONFIG）はここには無い。
 * 正本は data/subjects/joho/ で、配信用は assets/generated/subjects/joho.*.json。
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

/* HTML のインライン属性（onclick="go('catalog')" など）から呼ばれる名前を window へ載せ直す。
   function 宣言は巻き上げ済みなので本体より先に載せられる。本体の途中で例外が出ても
   画面の操作が死なないよう、あえてここで載せる。以下は自動生成。 */
window.isProv = isProv; window.provLast = provLast; window.hRange = hRange; window.byDiffAsc = byDiffAsc; window.byDiffDesc = byDiffDesc; window.diffColor = diffColor; window.go = go; window.syncHash = syncHash; window.applyHash = applyHash; window.coverSrcs = coverSrcs; window.amazonURL = amazonURL; window.rakutenURL = rakutenURL; window.coverHTML = coverHTML; window.covLoad = covLoad; window.covErr = covErr; window.buildFilters = buildFilters; window.setFilter = setFilter; window.bookCardHTML = bookCardHTML; window.renderCatalog = renderCatalog; window.findConnections = findConnections; window.openModal = openModal; window.closeModal = closeModal; window.renderFootSubjects = renderFootSubjects; window.trapFocusables = trapFocusables; window.modalOpened = modalOpened; window.modalClosed = modalClosed; window.openBox = openBox;


/* 設定（CONFIG）は data/subjects/joho/config.json が正本。
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
   DATA — 大学受験 情報 参考書データベース
   ISBN は出版社・書店データベースで確認した版のもの。書影は Amazon の
   商品画像を第一参照とし、取れないものだけ b.cover に出版社公式等の URL を持たせる。
   diff: 体感難易度 1–10 / h: 完走の目安時間(概算)
   ============================================================ */


/* この科目は志望校別ルートを持たない（図鑑と書籍ページだけの科目）。
   ROUTES を参照する共通処理（モーダルの「ルート上の接続」）が
   undefined を踏まないように空で置く。 */


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
   STATE
   ============================================================ */
const S = {view:"home"};
const bookById = id => BOOKS.find(b=>b.id===id);

/* 画面はハッシュで指し示せる（/joho/#catalog）。ポータルや外部からの直リンクの宛先になる。
   履歴には積まない（replaceState）。この SPA は「戻る」を画面遷移として扱っていないため、
   pushState にすると戻るたびに 1 画面ずつ遡ることになり、サイトを離れられなくなる。 */
const VIEWS = ["home","catalog"];
function go(view){
  S.view = view;
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active", v.id==="view-"+view));
  document.querySelectorAll("#navDesktop button, #tabbar button").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
  window.scrollTo({top:0});
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
   画像の保存・再アップロード・加工は行っていません。
   学校専売の傍用問題集など Amazon に商品画像が無い本は、
   出版社公式サイト等で実在を確認した URL を b.cover に持たせて最優先で参照します。 */
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
   CATALOG
   ============================================================ */
let catStage="all";
function buildFilters(){
  const fs = document.getElementById("filterScroll");
  let h = `<button class="chip active" data-k="stage" data-v="all" onclick="setFilter('stage','all',this)">すべて</button>`;
  for(const k in STAGES) h += `<button class="chip" data-k="stage" data-v="${k}" onclick="setFilter('stage','${k}',this)">${STAGES[k].label}</button>`;
  fs.innerHTML = h;
}
function setFilter(k,v,btn){
  catStage = v;
  document.querySelectorAll(`.chip[data-k="${k}"]`).forEach(c=>c.classList.toggle("active", c.dataset.v===v));
  renderCatalog();
}
/* 絞り込みの結果が 0 件のときに出す。空文字だと前の結果が残って見える */
const EMPTY_HTML = `<div class="cat-empty">条件に合う参考書がありません。絞り込みを緩めてください。</div>`;

/* 図鑑・検索結果に並べる 1 枚のカード。セクション表示と通常表示で共有する */
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
      <div class="bc-tags"><span class="tag tag-stage" style="background:${st.color}">${st.short}</span>${b.subjects ? `<span class="tag">${b.subjects}</span>` : ""}</div>
    </div>
  </div>`;
}

function renderCatalog(){
  const q = (document.getElementById("book-search").value||"").trim().toLowerCase();
  const sort = document.getElementById("sortSel").value;
  let list = BOOKS.filter(b=>{
    if(catStage!=="all" && b.stage!==catStage) return false;
    if(q){
      const hay = (b.name+b.official+b.pub+b.desc+b.subjects+b.style+(b.unis||[]).join(" ")).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  document.getElementById("catCount").textContent = list.length;
  const grid = document.getElementById("bookGrid");
  if(sort==="field"){
    /* 役割別×難易度順。共通テストと過去問はここで独立したまとまりになる */
    let html = "";
    for(const k in STAGES){
      const g = list.filter(b=>b.stage===k).sort(byDiffAsc);
      if(!g.length) continue;
      html += `<div class="cat-sec" style="--sc:${STAGES[k].color}">${STAGES[k].label}<small>${g.length} BOOKS — やさしい順</small></div>`;
      html += g.map(bookCardHTML).join("");
    }
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
    for(const br of ["bun","ri"]){
      const g = ROUTES[t][br]; if(!g) continue;
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
    <a class="detail-btn" href="/joho/books/${b.id}/">
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
   FOOTER / LEGAL
   ============================================================ */
/* 他科目へのリンク。冊数は各科目の実数に合わせて手で直す */
const OTHER_SUBJECTS = [
  {
    "dir": "english",
    "mark": "英",
    "full": "英語ルート大全",
    "color": "#B5432A",
    "n": 252
  },
  {
    "dir": "japanese",
    "mark": "国",
    "full": "国語ルート大全",
    "color": "#8A6D2F",
    "n": 192
  },
  {
    "dir": "math",
    "mark": "数",
    "full": "数学ルート大全",
    "color": "#24427C",
    "n": 162
  },
  {
    "dir": "science",
    "mark": "理",
    "full": "理科ルート大全",
    "color": "#2F6E4F",
    "n": 375
  },
  {
    "dir": "social",
    "mark": "社",
    "full": "社会ルート大全",
    "color": "#5B4E9E",
    "n": 293
  },
  {
    "dir": "joho",
    "mark": "情",
    "full": "情報ルート大全",
    "color": "#1F6E7A",
    "n": 29
  },
  {
    "dir": "shoron",
    "mark": "論",
    "full": "小論文ルート大全",
    "color": "#8E3B5E",
    "n": 89
  }
];
function renderFootSubjects(){
  document.getElementById("footSubjects").innerHTML = OTHER_SUBJECTS.map(o=>
    `<a href="/${o.dir}/" style="--fsc:${o.color}"${o.dir==="joho"?' aria-current="page"':''}>
      <span class="fs-mark">${o.mark}</span>
      <span class="fs-txt"><b>${o.full}</b><span>${o.n} BOOKS</span></span>
    </a>`).join("");
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
});document.getElementById("book-search").addEventListener("input",()=>renderCatalog());

buildFilters();
renderCatalog();
renderFootSubjects();

/* ハッシュ付きで開かれていれば、その画面から始める */
applyHash();

/* 状態を持つ束縛は本体のあとで載せる（const / let は巻き上げの対象外のため）。自動生成 */
  try { window.S = S; } catch (e) { /* まだ宣言に達していない名前は飛ばす */ }
  try { window.OTHER_SUBJECTS = OTHER_SUBJECTS; } catch (e) { /* まだ宣言に達していない名前は飛ばす */ }
};
