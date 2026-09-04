/**
 * `/progress/` の画面。中身は端末の `localStorage` にしかないので、ここで描く。
 *
 * **文字列は必ず `textContent` で入れる。** `innerHTML` を使わない。
 * 取り込んだ JSON には利用者が書いた文字が入っていて、そのまま HTML として
 * 扱うと取り込みが攻撃の入口になる。
 *
 * **ネットワークへ何も出さない。** fetch も送信もしない。
 * 書き出しはブラウザの中で Blob を作るだけ。
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var P = global.RTProgress;
  if (!doc || !P) return;

  var SUBJECTS = global.RT_PROGRESS_SUBJECTS || [];
  var subjectLabel = {};
  SUBJECTS.forEach(function (s) { subjectLabel[s.id] = s.label; });

  var el = function (id) { return doc.getElementById(id); };

  /** 子要素を全部消す。innerHTML = "" と違い、部分的な HTML 解釈が起きない */
  function empty(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function make(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  /** 読み上げにも届く形で状況を伝える */
  function say(text) {
    var s = el('pgStatus');
    if (!s) return;
    empty(s);
    if (text) s.appendChild(make('p', null, text));
  }

  /* ============================================================
     壊れたデータ

     黙って上書きしない。取り出すか、初期化するかを選ばせる。
     ============================================================ */

  function renderDamaged() {
    var d = P.damagedInfo();
    if (!d) return false;
    var box = el('pgStatus');
    empty(box);

    var note = make('div', 'pg-note');
    note.appendChild(make('p', null,
      '保存されている記録の一部を読めませんでした（' + d.reason + '）。'
      + '中身は消していません。下の「生データを取り出す」で控えを取ってから、'
      + '必要なら初期化してください。'));
    if (d.skipped && d.skipped.length) {
      note.appendChild(make('p', null, '読めなかった項目: ' + d.skipped.length + ' 件'));
    }

    var actions = make('div', 'pg-actions');
    var dl = make('button', 'pg-btn', '生データを取り出す');
    dl.type = 'button';
    dl.addEventListener('click', function () { download('rt-progress-raw.txt', d.raw, 'text/plain'); });
    var reset = make('button', 'pg-btn pg-btn--danger', '初期化する');
    reset.type = 'button';
    reset.addEventListener('click', function () {
      P.clear();
      say('記録を初期化しました。');
      renderAll();
    });
    actions.appendChild(dl);
    actions.appendChild(reset);
    note.appendChild(actions);
    box.appendChild(note);
    return true;
  }

  /* ============================================================
     描画
     ============================================================ */

  function renderSummary() {
    var box = el('pgSummary');
    if (!box) return;
    empty(box);
    var s = P.summary();
    var rows = [
      ['記録した数', s.total],
      [P.STATUS_LABEL.in_progress, s.in_progress],
      [P.STATUS_LABEL.completed, s.completed],
      [P.STATUS_LABEL.on_hold, s.on_hold],
      [P.STATUS_LABEL.not_started, s.not_started],
    ];
    rows.forEach(function (r) {
      var d = make('div');
      d.appendChild(make('dt', null, r[0]));
      d.appendChild(make('dd', null, String(r[1])));
      box.appendChild(d);
    });
  }

  function renderList() {
    var box = el('pgList');
    if (!box) return;
    empty(box);
    var all = P.all();
    var keys = Object.keys(all.books).sort();
    if (!keys.length) {
      box.appendChild(make('p', 'pg-empty',
        'まだ記録がありません。科目ページの参考書図鑑か、参考書ごとのページから状態を付けられます。'));
      return;
    }
    keys.forEach(function (k) {
      var e = all.books[k];
      var parts = k.split(':');
      var sub = parts[0];
      var bookId = parts.slice(1).join(':');

      var row = make('div', 'pg-row');
      var name = make('div', 'pg-row__name', bookId);
      name.appendChild(doc.createTextNode(' '));
      name.appendChild(make('span', 'pg-row__sub', subjectLabel[sub] || sub));
      row.appendChild(name);

      var st = make('span', 'pg-row__st', P.STATUS_LABEL[e.status] || e.status);
      st.setAttribute('data-st', e.status);
      row.appendChild(st);

      if (typeof e.progressPercent === 'number') {
        row.appendChild(make('span', 'pg-row__sub', e.progressPercent + '%'));
      }
      if (e.startedAt) row.appendChild(make('span', 'pg-row__sub', '開始 ' + e.startedAt));
      if (e.currentLocation) row.appendChild(make('div', 'pg-row__loc', 'いまここ: ' + e.currentLocation));

      var link = make('a', 'pg-row__sub', '参考書のページを開く');
      link.href = '/' + encodeURIComponent(sub) + '/books/' + encodeURIComponent(bookId) + '/';
      row.appendChild(link);

      box.appendChild(row);
    });
  }

  function renderWeekly() {
    var box = el('pgWeekly');
    if (!box) return;
    empty(box);
    var all = P.all();
    var cands = Object.keys(all.books).map(function (k) {
      var parts = k.split(':');
      return { subjectId: parts[0], bookId: parts.slice(1).join(':'), name: parts.slice(1).join(':') };
    });
    var picks = P.weeklyPicks(cands, 3);
    if (!picks.length) {
      box.appendChild(make('p', 'pg-empty', '学習中と未着手の記録がありません。'));
      return;
    }
    picks.forEach(function (p) {
      var d = make('div', 'pg-pick');
      d.appendChild(make('b', null, p.name));
      d.appendChild(make('span', 'pg-row__sub',
        (subjectLabel[p.subjectId] || p.subjectId) + '・' + (P.STATUS_LABEL[p.status] || p.status)));
      box.appendChild(d);
    });
  }

  function renderGoal() {
    var all = P.all();
    var v = el('pgGoalValue');
    var u = el('pgGoalUnit');
    if (!v || !u) return;
    if (all.weeklyGoal) {
      v.value = String(all.weeklyGoal.value);
      u.value = all.weeklyGoal.unit;
    } else {
      v.value = '';
    }
  }

  function renderAll() {
    renderSummary();
    renderWeekly();
    renderList();
    renderGoal();
  }

  /* ============================================================
     取り出し
     ============================================================ */

  /**
   * ブラウザの中だけでファイルを渡す。**サーバーへは送らない。**
   * `URL.createObjectURL` が使えない環境では、その旨を伝えて終わる。
   */
  function download(filename, text, mime) {
    try {
      var blob = new Blob([text], { type: (mime || 'application/json') + ';charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = doc.createElement('a');
      a.href = url;
      a.download = filename;
      doc.body.appendChild(a);
      a.click();
      doc.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 0);
      say('「' + filename + '」を書き出しました。');
    } catch (e) {
      say('この環境ではファイルを書き出せませんでした。');
    }
  }

  /* ============================================================
     取り込み

     **下見 → 確認 → 反映**の順を崩さない。
     下見の時点では localStorage を一切変えない（progress.js 側で保証）。
     ============================================================ */

  function renderPreview(pv) {
    var box = el('pgImportPreview');
    empty(box);
    if (!pv.ok) {
      box.appendChild(make('div', 'pg-note', '読み込めませんでした: ' + pv.reason));
      say('読み込めませんでした: ' + pv.reason);
      return;
    }

    var c = pv.counts;
    var note = make('div', 'pg-note');
    note.appendChild(make('b', null, '読み込む前に確認してください'));
    var dl = make('div', 'pg-diff');
    [
      ['ファイルに入っていて取り込める数', c.incoming],
      ['新しく増える数', c.added],
      ['いまの記録から変わる数', c.changed],
      ['同じ内容で変わらない数', c.same],
      ['掲載していない ID（取り込まない）', c.unknown],
      ['形が違って読めなかった項目', c.malformed],
      ['いま記録している数', c.currentTotal],
    ].forEach(function (r) {
      dl.appendChild(make('div', null, r[0] + ': ' + r[1]));
    });
    note.appendChild(dl);

    var actions = make('div', 'pg-actions');

    var merge = make('button', 'pg-btn', '既存へ統合する');
    merge.type = 'button';
    merge.addEventListener('click', function () {
      var r = P.commitImport(pv, 'merge');
      say(r.ok ? '統合しました（増えた ' + c.added + ' / 変わった ' + c.changed + '）。' : '保存できませんでした。');
      empty(box);
      renderAll();
    });

    var replace = make('button', 'pg-btn pg-btn--danger', '置き換える');
    replace.type = 'button';
    replace.addEventListener('click', function () {
      // 置換はいまの記録が消える。**もう一度確認する**
      empty(actions);
      var warn = make('div', 'pg-note',
        'いまの記録 ' + c.currentTotal + ' 件をすべて捨てて、ファイルの ' + c.incoming + ' 件に置き換えます。'
        + 'この操作は元に戻せません。');
      box.appendChild(warn);
      var yes = make('button', 'pg-btn pg-btn--danger', '置き換えを実行する');
      yes.type = 'button';
      yes.addEventListener('click', function () {
        var r = P.commitImport(pv, 'replace');
        say(r.ok ? '置き換えました（' + c.incoming + ' 件）。' : '保存できませんでした。');
        empty(box);
        renderAll();
      });
      var no = make('button', 'pg-btn', 'やめる');
      no.type = 'button';
      no.addEventListener('click', function () { empty(box); say('置き換えをやめました。'); });
      var row = make('div', 'pg-actions');
      row.appendChild(yes);
      row.appendChild(no);
      box.appendChild(row);
      yes.focus();
    });

    var cancel = make('button', 'pg-btn', 'やめる');
    cancel.type = 'button';
    cancel.addEventListener('click', function () { empty(box); say('読み込みをやめました。'); });

    actions.appendChild(merge);
    actions.appendChild(replace);
    actions.appendChild(cancel);
    note.appendChild(actions);
    box.appendChild(note);
    say('読み込む内容を表示しました。統合するか置き換えるかを選んでください。');
  }

  /** 現行データに在る ID かどうか。/progress/ は書籍一覧を持たないので科目だけ見る */
  function knownId(subjectId) {
    return Object.prototype.hasOwnProperty.call(subjectLabel, subjectId);
  }

  /* ============================================================
     配線
     ============================================================ */

  function wire() {
    var exportBtn = el('pgExport');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        download('rt-progress-' + new Date().toISOString().slice(0, 10) + '.json',
          JSON.stringify(P.exportData(), null, 2));
      });
    }

    var file = el('pgImportFile');
    if (file) {
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        if (f.size > P.IMPORT_MAX_BYTES) {
          renderPreview({ ok: false, reason: 'ファイルが大きすぎます（上限 ' + P.IMPORT_MAX_BYTES + ' バイト）' });
          file.value = '';
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          renderPreview(P.previewImport(String(reader.result), knownId));
          file.value = '';
        };
        reader.onerror = function () {
          renderPreview({ ok: false, reason: 'ファイルを読めませんでした' });
          file.value = '';
        };
        reader.readAsText(f);
      });
    }

    var goalSave = el('pgGoalSave');
    if (goalSave) {
      goalSave.addEventListener('click', function () {
        var v = parseInt(el('pgGoalValue').value, 10);
        var u = el('pgGoalUnit').value;
        var r = P.setWeeklyGoal({ value: v, unit: u });
        say(r.ok ? '週の目標を保存しました。' : '保存できませんでした: ' + (r.reason || ''));
        renderGoal();
      });
    }
    var goalClear = el('pgGoalClear');
    if (goalClear) {
      goalClear.addEventListener('click', function () {
        P.setWeeklyGoal(null);
        say('週の目標を消しました。');
        renderGoal();
      });
    }

    var clearBtn = el('pgClear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        var box = el('pgClearConfirm');
        empty(box);
        var s = P.summary();
        var note = make('div', 'pg-note',
          '学習の記録 ' + s.total + ' 件を消します。消えるのは学習の記録だけで、'
          + '保存したルートと学習ペースの設定は残ります。元に戻せません。');
        var row = make('div', 'pg-actions');
        var yes = make('button', 'pg-btn pg-btn--danger', '消す');
        yes.type = 'button';
        yes.addEventListener('click', function () {
          P.clear();
          empty(box);
          say('学習の記録を消しました。');
          renderAll();
        });
        var no = make('button', 'pg-btn', 'やめる');
        no.type = 'button';
        no.addEventListener('click', function () { empty(box); say('取り消しました。'); });
        row.appendChild(yes);
        row.appendChild(no);
        note.appendChild(row);
        box.appendChild(note);
        yes.focus();
      });
    }
  }

  function init() {
    // 壊れたデータがあれば、まずそれを出す（描画は続ける）
    renderDamaged();
    renderAll();
    wire();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
