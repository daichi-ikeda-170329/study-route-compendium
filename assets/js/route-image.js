/**
 * 表示中のルート・診断結果を 1080×1350（縦）の PNG に書き出す（仕様書 4.3）。
 *
 *   RTRouteImage.save(button)   ボタンから呼ぶ。近くの [data-route-image] を描いて保存する
 *   RTRouteImage.collect(el)    描く中身を集める（テスト用に公開）
 *
 * ## 何を読むか
 *
 * `[data-route-image]` を持つ要素の中から、次の順で行を拾う。
 *   1. `[data-ri-item]`（静的な志望校別ルートページ。data-ri-no / -name / -role / -diff / -kind）
 *   2. `.climb-node[data-book-id]`（科目トップのルート画面。書名は h3/h4、役割は .cn-info__role）
 *   3. `.opt-list .opt`（3 分診断の結果）
 * 見出しは `data-ri-title` / `data-ri-sub`、無ければ `.rs-goal` / `.result-hero h3` から取る。
 *
 * ## 書影は描かない
 *
 * 外部の画像を canvas に描くと canvas が汚染され、toBlob が失敗する。
 * 描くのはサイト名・科目・見出し・本の番号と書名・役割・難易度・並行枠・URL だけ。
 * 依存パッケージ・CDN は使わない。
 */
(function (global) {
  'use strict';

  var W = 1080, H = 1350, PAD = 72;
  var BG = '#F6F4EF', INK = '#1B2437', INK2 = '#3A4152', INK3 = '#7A8090';

  function text(el) { return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }

  /** 描く中身を集める */
  function collect(box) {
    var doc = box.ownerDocument || global.document;
    var items = [];
    var marked = box.querySelectorAll('[data-ri-item]');
    if (marked.length) {
      for (var i = 0; i < marked.length; i++) {
        var m = marked[i];
        items.push({
          no: m.getAttribute('data-ri-no') || '', name: m.getAttribute('data-ri-name') || '',
          role: m.getAttribute('data-ri-role') || '', diff: m.getAttribute('data-ri-diff') || '',
          para: m.getAttribute('data-ri-kind') === 'para',
        });
      }
    } else {
      var nodes = box.querySelectorAll('.climb-node[data-book-id]');
      for (var j = 0; j < nodes.length; j++) {
        var n = nodes[j];
        var d = (text(n).match(/難易度\s*(\d+)\s*\/\s*10/) || [])[1] || '';
        items.push({
          no: text(n.querySelector('.cn-step')), name: text(n.querySelector('.cn-info h3, .cn-info h4')),
          role: text(n.querySelector('.cn-info__role')), diff: d, para: n.classList.contains('para'),
        });
      }
      if (!items.length) {
        var opts = box.querySelectorAll('.opt-list .opt');
        for (var k = 0; k < opts.length; k++) {
          var o = opts[k];
          var sub = text(o.querySelector('.opt__txt > span'));
          items.push({ no: text(o.querySelector('.opt__ic')), name: text(o.querySelector('.opt__txt b')),
            role: sub.split('・')[0].trim(), diff: '', para: false });
        }
      }
    }
    var title = box.getAttribute('data-ri-title')
      || text(box.querySelector('.result-hero h3')) || text(box.querySelector('.rs-goal')) || text(doc.querySelector('h1'));
    var subject = box.getAttribute('data-ri-sub') || text(doc.querySelector('.logo__txt b')) || 'ルート大全';
    var share = box.querySelector('.rt-share[data-rt-url]');
    var url = box.getAttribute('data-ri-url') || (share && share.getAttribute('data-rt-url')) || String(global.location.href);
    var file = box.getAttribute('data-ri-file') || fileName(url);
    return { subject: subject, title: title, url: url, file: file, items: items.filter(function (x) { return x.name; }) };
  }

  /** route-taizen-<科目>-<志望レベル>.png。分からなければ shindan */
  function fileName(url) {
    var dir = '', tier = '';
    try {
      var u = new URL(url, global.location.href);
      dir = (u.pathname.split('/').filter(Boolean)[0] || '');
      var r = u.searchParams.get('r');
      if (r) tier = r.split('.')[1] || '';
    } catch (e) { /* URL を読めなければ既定の名前にする */ }
    return 'route-taizen-' + (dir || 'route') + '-' + (tier || 'shindan') + '.png';
  }

  /** 幅に収まるように 1 行ずつ切る（最大 lines 行。はみ出す分は … で切る） */
  function wrap(ctx, s, maxW, lines) {
    var out = [], cur = '';
    var chars = Array.from(String(s));
    for (var i = 0; i < chars.length; i++) {
      var t = cur + chars[i];
      if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = chars[i]; if (out.length === lines) break; }
      else cur = t;
    }
    if (out.length < lines && cur) out.push(cur);
    var used = out.join('').length;
    if (used < chars.length && out.length) {
      var last = out[out.length - 1];
      while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      out[out.length - 1] = last + '…';
    }
    return out;
  }

  /** canvas に描く。書影は描かない（外部画像で canvas が汚染され toBlob が失敗するため） */
  function draw(data, doc) {
    var c = (doc || global.document).createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    var family = '"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
    try {
      var f = global.getComputedStyle(global.document.body).fontFamily;
      if (f) family = f + ',sans-serif';
    } catch (e) { /* 取れなければ既定の書体 */ }
    var font = function (px, w) { return (w || 400) + ' ' + px + 'px ' + family; };

    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, 12);

    ctx.fillStyle = INK3; ctx.font = font(26, 700);
    ctx.fillText('ルート大全 — ' + data.subject, PAD, 84);

    ctx.fillStyle = INK; ctx.font = font(50, 800);
    var y = 160;
    wrap(ctx, data.title, W - PAD * 2, 2).forEach(function (l) { ctx.fillText(l, PAD, y); y += 64; });

    var main = data.items.filter(function (x) { return !x.para; });
    var para = data.items.filter(function (x) { return x.para; });
    var MAX_MAIN = 12;
    y += 16;
    ctx.strokeStyle = 'rgba(27,36,55,.14)'; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
    y += 50;
    main.slice(0, MAX_MAIN).forEach(function (it, i) {
      ctx.fillStyle = INK3; ctx.font = font(24, 700);
      ctx.fillText(String(it.no || i + 1).padStart(2, '0'), PAD, y);
      ctx.fillStyle = INK; ctx.font = font(30, 700);
      ctx.fillText(wrap(ctx, it.name, W - PAD * 2 - 70, 1)[0] || '', PAD + 70, y);
      ctx.fillStyle = INK2; ctx.font = font(21, 400);
      ctx.fillText([it.role, it.diff ? '難易度 ' + it.diff + '/10' : ''].filter(Boolean).join(' ・ '), PAD + 70, y + 30);
      y += 70;
    });
    if (main.length > MAX_MAIN) {
      ctx.fillStyle = INK3; ctx.font = font(22, 400);
      ctx.fillText('ほか ' + (main.length - MAX_MAIN) + ' 冊', PAD + 70, y); y += 40;
    }
    if (para.length && y < H - 260) {
      y += 10;
      ctx.fillStyle = INK2; ctx.font = font(24, 700);
      ctx.fillText('並行して進める本', PAD, y); y += 40;
      ctx.font = font(24, 400);
      wrap(ctx, para.map(function (p) { return p.name; }).join(' / '), W - PAD * 2, 3).forEach(function (l) {
        ctx.fillText(l, PAD, y); y += 34;
      });
    }

    ctx.strokeStyle = 'rgba(27,36,55,.14)'; ctx.beginPath(); ctx.moveTo(PAD, H - 150); ctx.lineTo(W - PAD, H - 150); ctx.stroke();
    ctx.fillStyle = INK; ctx.font = font(30, 800);
    ctx.fillText('route-taizen.com', PAD, H - 98);
    ctx.fillStyle = INK3; ctx.font = font(18, 400);
    wrap(ctx, data.url, W - PAD * 2, 2).forEach(function (l, i) { ctx.fillText(l, PAD, H - 62 + i * 24); });
    return c;
  }

  /** ボタンから呼ぶ。近くの [data-route-image] を描いて PNG を保存する */
  function save(btn) {
    var doc = global.document;
    /* ボタンを囲む [data-route-image] を使う。科目トップのルート画面は共有ブロックが
       #routeOutput の外に描かれるので、囲むものが無いときは「表示中で行を持つもの」を選ぶ */
    var box = btn && btn.closest ? btn.closest('[data-route-image]') : null;
    if (!box) {
      var all = doc.querySelectorAll('[data-route-image]');
      for (var i = 0; i < all.length && !box; i++) {
        if (all[i].offsetParent !== null && collect(all[i]).items.length) box = all[i];
      }
    }
    var msg = btn && btn.parentNode ? btn.parentNode.parentNode.querySelector('.rt-share__msg, .sharebar__msg') : null;
    var say = function (t) { if (msg) msg.textContent = t; };
    if (!box) { say('保存できるルートがありません'); return; }
    var data = collect(box);
    // 共有 URL は押したボタンの共有ブロックのものを使う（画像に載せる URL とファイル名の志望レベル）
    var share = btn && btn.closest ? btn.closest('.rt-share[data-rt-url]') : null;
    if (share && !box.getAttribute('data-ri-url')) {
      data.url = share.getAttribute('data-rt-url');
      if (!box.getAttribute('data-ri-file')) data.file = fileName(data.url);
    }
    if (!data.items.length) { say('保存できるルートがありません'); return; }
    var canvas = draw(data, doc);
    try {
      canvas.toBlob(function (blob) {
        if (!blob) { say('画像を作れませんでした'); return; }
        var a = doc.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = data.file;
        doc.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        say('画像を保存しました');
      }, 'image/png');
    } catch (e) { say('画像を作れませんでした'); }
  }

  var api = { save: save, collect: collect, W: W, H: H };
  global.RTRouteImage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
