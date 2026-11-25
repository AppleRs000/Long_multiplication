(function () {
  'use strict';

  /* ========== ユーティリティ ========== */
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  };
  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const digitsOf = (n) => String(n).split('').map(Number);
  const PL = ['一', '十', '百', '千'];
  const TYPE_LABEL = { '21': '2けた×1けた', '31': '3けた×1けた', '22': '2けた×2けた', '32': '3けた×2けた' };
  const CARRY_LABEL = { any: 'くり上がりどちらも', yes: 'くり上がりあり', no: 'くり上がりなし' };
  const STAMPS = ['🌟', '🍎', '🐶', '🐱', '🐼', '🚀', '🌈', '🍓', '🦊', '⚽', '🐧', '🍩'];

  function fmtClock(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function fmtJa(s) {
    s = Math.round(s);
    const m = Math.floor(s / 60);
    return (m ? m + '分' : '') + (s % 60) + '秒';
  }
  function dateShort(t) {
    const d = new Date(t);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function dateLong(t) {
    const d = new Date(t);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* ========== 保存データ ========== */
  const SK = 'kakezan-hissan-v1';
  const emptyStore = () => ({ history: [], best: {}, stamps: [], mistakes: [], settings: {} });
  function loadStore() {
    try {
      const d = JSON.parse(localStorage.getItem(SK));
      if (d && typeof d === 'object') return Object.assign(emptyStore(), d);
    } catch (e) { /* 何もしない */ }
    return emptyStore();
  }
  function saveStore() {
    try { localStorage.setItem(SK, JSON.stringify(store)); } catch (e) { /* 保存できない環境 */ }
  }
  let store = loadStore();
  const settings = Object.assign({ type: '21', n: 10, carry: 'any', mode: 'each', limit: 0, sound: 1 }, store.settings);
  function saveSettings() { store.settings = Object.assign({}, settings); saveStore(); }

  /* ========== 効果音（Web Audio・ファイル不要） ========== */
  let actx = null;
  const SFX = {
    ok: [[784, 0, 0.14], [1047, 0.13, 0.3]],
    ng: [[330, 0, 0.18], [262, 0.17, 0.32]],
    perfect: [[523, 0, 0.14], [659, 0.13, 0.14], [784, 0.26, 0.14], [1047, 0.39, 0.14], [784, 0.52, 0.12], [1047, 0.64, 0.55]]
  };
  function sfx(kind) {
    if (!settings.sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!actx) actx = new AC();
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime + 0.02;
      (SFX[kind] || []).forEach((n) => {
        const o = actx.createOscillator();
        const g = actx.createGain();
        const st = t0 + n[1];
        o.type = kind === 'ng' ? 'triangle' : 'sine';
        o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.25, st + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, st + n[2]);
        o.connect(g);
        g.connect(actx.destination);
        o.start(st);
        o.stop(st + n[2] + 0.05);
      });
    } catch (e) { /* 音が出せない環境では何もしない */ }
  }

  /* ========== 問題づくり ========== */
  // くり上がり：途中の位で次の位にくり上がるか
  function hasCarry(a, m) {
    const ds = digitsOf(a).reverse();
    let c = 0;
    for (let j = 0; j < ds.length; j++) {
      const p = ds[j] * m + c;
      c = Math.floor(p / 10);
      if (c > 0 && j < ds.length - 1) return true;
    }
    return false;
  }

  function genOne(da, db, carry) {
    for (let t = 0; t < 2000; t++) {
      const bd = [];
      for (let k = 0; k < db; k++) bd.push(carry === 'no' ? rand(2, 4) : rand(2, 9));
      const m = Math.max.apply(null, bd);
      const lim = carry === 'no' ? Math.floor(9 / m) : 9;
      let a = 0;
      for (let k = 0; k < da; k++) a = a * 10 + (k === 0 ? rand(1, 9) : rand(0, lim));
      const anyCarry = bd.some((x) => hasCarry(a, x));
      if (carry === 'no' && anyCarry) continue;
      if (carry === 'yes' && !anyCarry) continue;
      return { a: a, b: bd.reduce((x, y) => x * 10 + y, 0) };
    }
    return { a: da === 2 ? 56 : 456, b: db === 2 ? 34 : 7 };
  }

  function genProblems(da, db, n, carry) {
    const out = [];
    const seen = new Set();
    let tries = 0;
    while (out.length < n) {
      const p = genOne(da, db, carry);
      const k = p.a + 'x' + p.b;
      tries++;
      if (seen.has(k) && tries < 1000) continue;
      seen.add(k);
      out.push(p);
    }
    return out;
  }

  /* ========== 正しい手順の文章 ========== */
  function steps(a, b) {
    const out = [];
    const A = digitsOf(a).reverse();
    const bd = digitsOf(b).reverse();
    const parts = [];
    bd.forEach((m, k) => {
      if (bd.length > 1) out.push('【' + a + ' × ' + m + '】（かける数の' + PL[k] + 'の位）');
      let c = 0;
      A.forEach((d, j) => {
        const p = d * m + c;
        const last = j === A.length - 1;
        const nc = Math.floor(p / 10);
        let s = PL[j] + 'の位：' + d + ' × ' + m + (c ? ' + ' + c + '（くり上がり）' : '') + ' = ' + p;
        if (last) s += ' → ' + p + 'をそのまま書く';
        else if (nc) s += ' → ' + (p % 10) + 'を書いて、' + nc + 'をくり上げる';
        else s += ' → ' + p + 'を書く';
        out.push(s);
        c = nc;
      });
      parts.push(a * m * Math.pow(10, k));
      if (bd.length > 1) {
        out.push(a + ' × ' + m + ' = ' + (a * m) +
          (k > 0 ? '（' + PL[k] + 'の位の計算なので、一つ左にずらして書く）' : ''));
      }
    });
    if (bd.length > 1) out.push('たし算：' + parts.join(' + ') + ' = ' + (a * b));
    out.push('答え：' + (a * b));
    return out;
  }

  // ヒント：答えは言わずに、つぎに何を計算するかを1行ずつ出す
  function hints(a, b) {
    const out = [];
    const A = digitsOf(a).reverse();
    const bd = digitsOf(b).reverse();
    bd.forEach((m, k) => {
      if (bd.length > 1) {
        out.push('まず ' + a + ' × ' + m + ' を計算するよ（かける数の' + PL[k] + 'の位）' +
          (k > 0 ? '。答えは一つ左にずらして書こう' : ''));
      }
      let c = 0;
      A.forEach((d, j) => {
        const p = d * m + c;
        out.push((j === 0 && bd.length === 1 ? 'まず ' : '') + PL[j] + 'の位：' + d + ' × ' + m +
          (c ? ' + ' + c + '（くり上がり）' : '') + ' を計算しよう');
        c = Math.floor(p / 10);
      });
    });
    if (bd.length > 1) out.push('できた2つの答えを たし算しよう');
    return out;
  }

  function stepsOl(a, b) {
    const ol = el('ol');
    steps(a, b).forEach((s) => ol.appendChild(el('li', null, s)));
    return ol;
  }

  /* ========== 筆算フォーム ========== */
  // o.interactive: 入力できる / o.fill: 答えを埋める / o.print: 印刷用
  function buildForm(a, b, o) {
    o = o || {};
    const A = String(a), B = String(b), P = String(a * b);
    const N = P.length + 1;
    const f = el('div', 'form' + (o.print ? ' print' : ''));
    f.style.setProperty('--n', N);
    const cells = { memo: [], p0: [], p1: [], ans: [] };
    let r = 0;
    const put = (node, row, col, span) => {
      node.style.gridRow = row;
      node.style.gridColumn = span ? col + ' / span ' + span : col;
      f.appendChild(node);
    };
    const mk = (kind, i, exp) => {
      const c = el('div', 'cell ' + kind);
      c.dataset.kind = kind;
      c.dataset.i = i;
      c.dataset.exp = exp;
      if (o.fill && kind !== 'memo') c.textContent = exp;
      cells[kind][i] = c;
      return c;
    };

    if (o.interactive) {
      r++;
      for (let i = 0; i < A.length; i++) put(mk('memo', i, ''), r, N - A.length + 1 + i);
    }
    r++;
    for (let i = 0; i < A.length; i++) put(el('div', 'digit', A[i]), r, N - A.length + 1 + i);
    r++;
    // 「×」はかけられる数の左斜め下（かけ算の筆算の正しい書き方）
    put(el('div', 'digit op', '×'), r, N - A.length);
    for (let i = 0; i < B.length; i++) put(el('div', 'digit', B[i]), r, N - B.length + 1 + i);
    r++;
    put(el('div', 'hline'), r, 1, N);

    if (B.length === 2) {
      const p0 = String(a * (b % 10));
      const p1 = String(a * Math.floor(b / 10));
      r++;
      for (let i = 0; i < p0.length; i++) put(mk('p0', i, p0[i]), r, N - p0.length + 1 + i);
      r++;
      for (let i = 0; i < p1.length; i++) put(mk('p1', i, p1[i]), r, N - p1.length + i);
      r++;
      put(el('div', 'hline'), r, 1, N);
    }
    r++;
    for (let i = 0; i < P.length; i++) put(mk('ans', i, P[i]), r, N - P.length + 1 + i);

    f.cells = cells;
    return f;
  }

  /* ========== ゲームの状態 ========== */
  let G = null;
  let active = null;

  function newItem(p) {
    return {
      a: p.a, b: p.b, P: String(p.a * p.b),
      data: { memo: [], p0: [], p1: [], ans: [] },
      judged: false, correct: false, got: '', img: null,
      hintN: 0, fixing: false, fixDone: false
    };
  }

  function showScreen(name) {
    ['home', 'play', 'result', 'records', 'print'].forEach((n) => {
      $('#screen-' + n).classList.toggle('hidden', n !== name);
    });
    window.scrollTo(0, 0);
  }

  function startGame(problems, opt) {
    opt = opt || {};
    G = {
      items: problems.map(newItem),
      idx: 0,
      mode: settings.mode,
      limit: settings.limit,
      start: Date.now(),
      streak: 0,
      retry: !!opt.retry,
      finished: false,
      timerId: null,
      pausedAt: null,
      cells: null,
      order: [],
      key: settings.type + '|' + problems.length + '|' + settings.carry,
      type: settings.type,
      carry: settings.carry
    };
    $('#streak').classList.add('hidden');
    showScreen('play');
    renderProblem();
    startTimer();
  }

  /* ---------- タイマー ---------- */
  function stopTimer() {
    if (G && G.timerId) { clearInterval(G.timerId); G.timerId = null; }
  }
  // 「こたえあわせ」後は「つぎへ」を押すまでタイマーを止める
  function nowEff() { return G.pausedAt || Date.now(); }
  function tick() {
    if (!G || G.finished) return;
    const e = (nowEff() - G.start) / 1000;
    const t = $('#timer');
    const mark = G.pausedAt ? '⏸ ' : '';
    if (G.limit) {
      const rem = Math.max(0, G.limit - e);
      t.textContent = (G.pausedAt ? '⏸ ' : '⏳ ') + 'のこり ' + fmtClock(rem);
      t.classList.toggle('warn', rem <= 30 && !G.pausedAt);
      if (rem <= 0) finish(true);
    } else {
      t.textContent = (mark || '⏱ ') + fmtClock(e);
      t.classList.remove('warn');
    }
  }
  function resumeTimer() {
    if (G && G.pausedAt) {
      G.start += Date.now() - G.pausedAt;
      G.pausedAt = null;
      tick();
    }
  }
  function startTimer() {
    stopTimer();
    G.timerId = setInterval(tick, 250);
    tick();
  }

  /* ---------- 1問の表示 ---------- */
  function renderProblem() {
    const it = G.items[G.idx];
    $('#progress').textContent = (G.idx + 1) + ' / ' + G.items.length;
    const holder = $('#formHolder');
    holder.innerHTML = '';
    const f = buildForm(it.a, it.b, { interactive: true });
    holder.appendChild(f);
    G.cells = f.cells;

    const hasPartial = G.cells.p0.length > 0;
    if (hasPartial) {
      const lab = el('div', 'formlabel', '点線のマスは とちゅうの計算（書かなくてもOK）');
      holder.appendChild(lab);
    }

    ['memo', 'p0', 'p1', 'ans'].forEach((k) => {
      G.cells[k].forEach((c, i) => {
        if (it.data[k][i]) c.textContent = it.data[k][i];
        c.addEventListener('click', () => {
          const cur = G.items[G.idx];
          if (cur.judged && !c.classList.contains('fixable')) return;
          setActive(c);
        });
      });
    });

    // 大きい位（左）から入力する
    G.order = [].concat(G.cells.p0, G.cells.p1, G.cells.ans);
    const firstEmpty = G.cells.ans.find((c) => !c.textContent) || G.cells.ans[G.cells.ans.length - 1];
    setActive(firstEmpty);

    initCanvas(it.img);

    const fb = $('#feedback');
    fb.className = 'feedback hidden';
    fb.innerHTML = '';
    if (it.judged) showJudged(it);
    renderHints(it);
    updateButtons();
  }

  function renderHints(it) {
    const hs = hints(it.a, it.b);
    const box = $('#hintBox');
    box.innerHTML = '';
    if (it.hintN > 0) {
      const ol = el('ol');
      hs.slice(0, it.hintN).forEach((s) => ol.appendChild(el('li', null, s)));
      box.appendChild(ol);
    }
    box.classList.toggle('hidden', it.hintN === 0 || it.judged);
    const btn = $('#btnHint');
    const more = it.hintN < hs.length;
    btn.disabled = !more;
    btn.textContent = it.hintN === 0 ? '💡 ヒント' : (more ? '💡 つぎのヒント' : '💡 ヒントは ここまで');
    btn.classList.toggle('hidden', it.judged);
  }

  function showHint() {
    const it = G.items[G.idx];
    if (it.judged) return;
    if (it.hintN < hints(it.a, it.b).length) it.hintN++;
    renderHints(it);
  }

  function setActive(c) {
    if (active) active.classList.remove('active');
    active = c;
    if (active) active.classList.add('active');
  }
  function moveActive(dir) {
    const i = G.order.indexOf(active);
    if (i < 0) return;
    const n = G.order[i + dir];
    if (n) setActive(n);
  }

  function collect() {
    if (!G || !G.cells) return;
    const it = G.items[G.idx];
    if (!it.judged) {
      ['memo', 'p0', 'p1', 'ans'].forEach((k) => {
        it.data[k] = G.cells[k].map((c) => c.textContent);
      });
    }
    try { it.img = $('#scratch').toDataURL(); } catch (e) { /* 何もしない */ }
  }

  function updateButtons() {
    const it = G.items[G.idx];
    const last = G.idx === G.items.length - 1;
    const prev = $('#btnPrev'), chk = $('#btnCheck'), next = $('#btnNext');
    const fix = $('#btnFix'), re = $('#btnRecheck');
    if (G.mode === 'each') {
      prev.classList.add('hidden');
      chk.classList.toggle('hidden', it.judged);
      fix.classList.toggle('hidden', !(it.judged && !it.correct && !it.fixing && !it.fixDone));
      re.classList.toggle('hidden', !it.fixing);
      next.classList.toggle('hidden', !it.judged);
      next.textContent = last ? 'けっかを見る ▶' : 'つぎへ ▶';
    } else {
      prev.classList.toggle('hidden', G.idx === 0);
      chk.classList.add('hidden');
      fix.classList.add('hidden');
      re.classList.add('hidden');
      next.classList.remove('hidden');
      next.textContent = last ? 'おわり（こたえあわせ） ▶' : 'つぎへ ▶';
    }
    const vis = [prev, chk, fix, re, next].filter((b) => !b.classList.contains('hidden')).length;
    $('.actions').style.gridTemplateColumns = 'repeat(' + Math.max(1, vis) + ', 1fr)';
  }

  /* ---------- 直し（×のあと、赤いマスだけ入力しなおす） ---------- */
  function fixMsg(text) {
    const fb = $('#feedback');
    let m = fb.querySelector('.fixmsg');
    if (!m) { m = el('div', 'fixmsg'); fb.appendChild(m); }
    m.textContent = text;
  }

  function startFix() {
    const it = G.items[G.idx];
    if (!it.judged || it.correct || it.fixing) return;
    it.fixing = true;
    const fixable = [];
    ['p0', 'p1', 'ans'].forEach((k) => {
      G.cells[k].forEach((c) => {
        if (c.classList.contains('ng')) {
          c.classList.remove('ng');
          c.classList.add('fixable');
          c.textContent = '';
          fixable.push(c);
        }
      });
    });
    G.order = fixable;
    setActive(fixable[0] || null);
    fixMsg('赤かったところを 入力しなおして、「なおして こたえあわせ」を押そう');
    updateButtons();
  }

  function recheck() {
    const it = G.items[G.idx];
    if (!it.fixing) return;
    let allOk = true;
    ['p0', 'p1', 'ans'].forEach((k) => {
      G.cells[k].forEach((c) => {
        if (!c.classList.contains('fixable')) return;
        const good = c.textContent === c.dataset.exp;
        if (good) { c.classList.remove('fixable', 'ng'); c.classList.add('ok'); }
        else if (k === 'ans' || c.textContent) { c.classList.add('ng'); if (k === 'ans') allOk = false; }
      });
    });
    if (allOk) {
      it.fixing = false;
      it.fixDone = true;
      G.order = [];
      setActive(null);
      fixMsg('🎉 なおせたね！ 同じまちがいは もうしないね');
      sfx('ok');
    } else {
      G.order = [].concat(G.cells.p0, G.cells.p1, G.cells.ans).filter((c) => c.classList.contains('fixable'));
      const firstBad = G.order.find((c) => c.classList.contains('ng')) || G.order[0];
      setActive(firstBad || null);
      fixMsg('まだ ちがうところがあるよ。やり方を見ながら もういちど！');
      sfx('ng');
    }
    updateButtons();
  }

  /* ---------- 判定 ---------- */
  function judgeItem(it) {
    const exp = it.P.split('');
    const got = exp.map((_, i) => it.data.ans[i] || '');
    it.got = got.join('');
    it.correct = got.every((g, i) => g === exp[i]);
    it.judged = true;
    // まちがえた問題のリストを更新
    const k = it.a + 'x' + it.b;
    const idx = store.mistakes.findIndex((m) => m.a + 'x' + m.b === k);
    if (it.correct) { if (idx >= 0) store.mistakes.splice(idx, 1); }
    else if (idx < 0) store.mistakes.push({ a: it.a, b: it.b });
    if (store.mistakes.length > 60) store.mistakes.shift();
  }

  function applyMarks(it) {
    ['p0', 'p1', 'ans'].forEach((k) => {
      G.cells[k].forEach((c) => {
        c.classList.remove('ok', 'ng');
        const v = c.textContent;
        if (k === 'ans') c.classList.add(v === c.dataset.exp ? 'ok' : 'ng');
        else if (v) c.classList.add(v === c.dataset.exp ? 'ok' : 'ng');
      });
    });
    setActive(null);
  }

  function showJudged(it) {
    applyMarks(it);
    const fb = $('#feedback');
    fb.className = 'feedback ' + (it.correct ? 'ok' : 'ng');
    fb.innerHTML = '';
    if (it.correct) {
      fb.appendChild(el('div', 'big', '○ せいかい！'));
    } else {
      fb.appendChild(el('div', 'big', '× おしい！'));
      fb.appendChild(el('div', 'exp', '正しい答えは ' + it.P + ' だよ（赤いところをなおそう）'));
      fb.appendChild(el('div', null, '正しい筆算のやり方：'));
      fb.appendChild(stepsOl(it.a, it.b));
    }
  }

  function checkNow() {
    const it = G.items[G.idx];
    if (it.judged) return;
    collect();
    judgeItem(it);
    G.pausedAt = Date.now();
    tick();
    if (it.correct) G.streak++; else G.streak = 0;
    const s = $('#streak');
    if (G.streak >= 2) { s.textContent = '🔥 れんぞく ' + G.streak; s.classList.remove('hidden'); }
    else s.classList.add('hidden');
    showJudged(it);
    sfx(it.correct ? 'ok' : 'ng');
    saveStore();
    renderHints(it);
    updateButtons();
  }

  function goNext() {
    const last = G.idx === G.items.length - 1;
    collect();
    resumeTimer();
    if (last) { finish(false); return; }
    G.idx++;
    renderProblem();
  }
  function goPrev() {
    if (G.idx === 0) return;
    collect();
    G.idx--;
    renderProblem();
  }

  /* ---------- 入力（テンキー・キーボード） ---------- */
  function press(k) {
    if (!G || G.finished || !active) return;
    const it = G.items[G.idx];
    if (it.judged && !active.classList.contains('fixable')) return;
    if (k === 'bs') {
      if (active.textContent) active.textContent = '';
      else { moveActive(-1); if (active) active.textContent = ''; }
      return;
    }
    if (k === 'next') { moveActive(1); return; }
    active.textContent = k;
    if (active.dataset.kind !== 'memo') moveActive(1);
  }

  /* ---------- 終了 ---------- */
  function finish(timeUp) {
    if (!G || G.finished) return;
    G.finished = true;
    stopTimer();
    if (!timeUp) { /* 現在の問題はすでに collect 済み */ }
    else collect();

    const elapsed = (nowEff() - G.start) / 1000;
    const sec = G.limit ? Math.min(elapsed, G.limit) : elapsed;

    G.items.forEach((it) => { if (!it.judged) judgeItem(it); });

    let run = 0, maxRun = 0;
    G.items.forEach((it) => {
      if (it.correct) { run++; maxRun = Math.max(maxRun, run); } else run = 0;
    });
    const n = G.items.length;
    const score = G.items.filter((it) => it.correct).length;
    const perfect = score === n;

    let newBest = false;
    if (perfect && !G.retry && !timeUp) {
      const old = store.best[G.key];
      if (old === undefined || sec < old) { store.best[G.key] = Math.round(sec * 10) / 10; newBest = true; }
    }
    let stamp = null;
    if (perfect) {
      stamp = STAMPS[rand(0, STAMPS.length - 1)];
      store.stamps.push({ e: stamp, t: Date.now() });
      if (store.stamps.length > 200) store.stamps.shift();
    }
    store.history.push({
      t: Date.now(), type: G.type, carry: G.carry, n: n, score: score,
      sec: Math.round(sec), retry: G.retry, perfect: perfect, streak: maxRun
    });
    if (store.history.length > 200) store.history.shift();
    saveStore();

    renderResult({ score, n, sec, perfect, newBest, stamp, maxRun, timeUp });
    if (perfect) sfx('perfect');
  }

  function renderResult(r) {
    const body = $('#resultBody');
    body.innerHTML = '';

    if (r.perfect) {
      const pr = el('div', 'praise');
      pr.appendChild(el('span', 'stampbig', r.stamp));
      pr.appendChild(document.createTextNode('ぜんぶ せいかい！ すごい！ スタンプをゲットしたよ！'));
      body.appendChild(pr);
    }

    const card = el('div', 'card score');
    card.appendChild(el('div', 'num', r.score + ' / ' + r.n));
    card.appendChild(el('div', 'sub', (G.retry ? 'まちがえた問題れんしゅう' : TYPE_LABEL[G.type] + '・' + CARRY_LABEL[G.carry])));
    card.appendChild(el('div', 'sub', '⏱ タイム ' + fmtJa(r.sec) + (r.timeUp ? '（時間ぎれ）' : '')));
    card.appendChild(el('div', 'sub', '🔥 いちばん長い れんぞく正かい：' + r.maxRun));
    if (r.newBest) card.appendChild(el('div', 'sub', '🏆 ベストタイム こうしん！'));
    else if (r.perfect && !G.retry && store.best[G.key] !== undefined)
      card.appendChild(el('div', 'sub', '🏆 ベストタイム：' + fmtJa(store.best[G.key])));
    body.appendChild(card);

    const wrong = G.items.filter((it) => !it.correct);
    if (wrong.length) {
      const b = el('button', 'btn blue', '📝 まちがえた ' + wrong.length + ' 問だけ やり直す');
      b.onclick = () => startGame(wrong.map((it) => ({ a: it.a, b: it.b })), { retry: true });
      body.appendChild(b);
    }
    const again = el('button', 'btn', '🔁 もういちど（あたらしい問題）');
    again.onclick = () => startNormal();
    body.appendChild(again);
    const home = el('button', 'btn gray', '🏠 ホームへ');
    home.onclick = () => goHome();
    body.appendChild(home);

    const list = el('div', 'card');
    list.style.marginTop = '14px';
    list.appendChild(el('h2', 'sec', 'もんだいの見なおし'));
    G.items.forEach((it, i) => {
      const d = el('div', 'ritem ' + (it.correct ? 'ok' : 'ng'));
      d.appendChild(el('span', 'mark', it.correct ? '○' : '×'));
      d.appendChild(el('span', null, '(' + (i + 1) + ') ' + it.a + ' × ' + it.b + ' = ' + it.P));
      if (it.hintN > 0) d.appendChild(el('span', null, '　💡ヒント ' + it.hintN + '回'));
      if (!it.correct && it.fixDone) d.appendChild(el('span', null, '　✏️ なおせた'));
      if (!it.correct) {
        d.appendChild(el('div', null, 'あなたの答え：' + (it.got.replace(/ /g, '') || '（書いていない）')));
        const det = el('details');
        det.appendChild(el('summary', null, 'やり方を見る'));
        det.appendChild(stepsOl(it.a, it.b));
        d.appendChild(det);
      }
      list.appendChild(d);
    });
    body.appendChild(list);
    showScreen('result');
  }

  /* ========== けいさんスペース（お絵かき） ========== */
  const cv = $('#scratch');
  const ctx = cv.getContext('2d');
  let tool = 'pen', drawing = false, lastPt = null;

  function cpos(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height };
  }
  function strokeStyle() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 26;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = tool === 'red' ? '#e5484d' : '#222';
      ctx.lineWidth = 4;
    }
  }
  cv.addEventListener('pointerdown', (e) => {
    drawing = true;
    cv.setPointerCapture(e.pointerId);
    lastPt = cpos(e);
    strokeStyle();
    ctx.beginPath();
    ctx.moveTo(lastPt.x, lastPt.y);
    ctx.lineTo(lastPt.x + 0.1, lastPt.y + 0.1);
    ctx.stroke();
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = cpos(e);
    strokeStyle();
    ctx.beginPath();
    ctx.moveTo(lastPt.x, lastPt.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPt = p;
    e.preventDefault();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => cv.addEventListener(ev, () => { drawing = false; }));

  function initCanvas(img) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (img) {
      const im = new Image();
      im.onload = () => { ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(im, 0, 0); };
      im.src = img;
    }
  }
  document.querySelectorAll('.tool').forEach((b) => {
    b.addEventListener('click', () => {
      const t = b.dataset.tool;
      if (t === 'clear') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, cv.width, cv.height);
        return;
      }
      tool = t;
      document.querySelectorAll('.tool').forEach((x) => x.classList.toggle('on', x === b));
    });
  });

  /* ========== ホーム ========== */
  function buildChips(id, opts, key) {
    const box = $('#' + id);
    box.innerHTML = '';
    opts.forEach((o) => {
      const v = o[0], label = o[1];
      const b = el('button', 'chip' + (String(settings[key]) === String(v) ? ' on' : ''), label);
      b.type = 'button';
      b.onclick = () => {
        settings[key] = typeof settings[key] === 'number' ? Number(v) : v;
        saveSettings();
        buildChips(id, opts, key);
      };
      box.appendChild(b);
    });
  }

  function renderHome() {
    buildChips('chips-type', [['21', '2けた × 1けた'], ['31', '3けた × 1けた'], ['22', '2けた × 2けた'], ['32', '3けた × 2けた']], 'type');
    buildChips('chips-n', [[5, '5問'], [10, '10問'], [20, '20問']], 'n');
    buildChips('chips-carry', [['any', 'どちらも'], ['yes', 'くり上がりあり'], ['no', 'くり上がりなし']], 'carry');
    buildChips('chips-mode', [['each', '1問ずつ'], ['end', 'さいごにまとめて']], 'mode');
    buildChips('chips-limit', [[0, 'なし'], [180, '3分'], [300, '5分'], [600, '10分']], 'limit');
    buildChips('chips-sound', [[1, 'あり 🔊'], [0, 'なし 🔇']], 'sound');

    const mc = store.mistakes.length;
    const rb = $('#btnRetryMistakes');
    rb.textContent = '📝 まちがえた問題だけ れんしゅう（' + mc + '問）';
    rb.disabled = mc === 0;

    const box = $('#stampBox');
    box.innerHTML = '';
    if (!store.stamps.length) {
      box.appendChild(el('span', 'none', '全問せいかいで スタンプがもらえるよ！'));
    } else {
      box.appendChild(document.createTextNode(store.stamps.slice(-30).map((s) => s.e).join(' ')));
      box.appendChild(el('div', 'none', 'スタンプ ' + store.stamps.length + ' こ'));
    }
  }

  function goHome() {
    if (G) { stopTimer(); }
    G = null;
    renderHome();
    showScreen('home');
  }

  function startNormal() {
    const da = Number(settings.type[0]), db = Number(settings.type[1]);
    startGame(genProblems(da, db, settings.n, settings.carry));
  }

  function startMistakes() {
    const list = store.mistakes.slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = rand(0, i);
      const t = list[i]; list[i] = list[j]; list[j] = t;
    }
    if (!list.length) return;
    startGame(list.slice(0, 10), { retry: true });
  }

  /* ========== 記録 ========== */
  function keyLabel(k) {
    const p = k.split('|');
    return (TYPE_LABEL[p[0]] || p[0]) + '・' + p[1] + '問・' + (CARRY_LABEL[p[2]] || p[2]);
  }

  function renderRecords() {
    const body = $('#recordsBody');
    body.innerHTML = '';

    const c1 = el('div', 'card');
    c1.appendChild(el('h2', 'sec', 'せいかい率（さいごの10回）'));
    const hist = store.history;
    if (!hist.length) {
      c1.appendChild(el('div', 'note', 'まだ きろくがないよ。れんしゅうしてみよう！'));
    } else {
      const chart = el('div', 'chart');
      hist.slice(-10).forEach((h) => {
        const bar = el('div', 'bar' + (h.perfect ? ' perfect' : ''));
        const fill = el('div', 'fill');
        fill.style.height = Math.round(h.score / h.n * 100) + '%';
        bar.appendChild(fill);
        bar.appendChild(el('div', 'lab', h.score + '/' + h.n));
        bar.appendChild(el('div', 'lab', dateShort(h.t)));
        chart.appendChild(bar);
      });
      c1.appendChild(chart);
      c1.appendChild(el('div', 'note', '緑のぼうは 全問せいかい！'));
    }
    body.appendChild(c1);

    const c2 = el('div', 'card');
    c2.appendChild(el('h2', 'sec', '🏆 ベストタイム（全問せいかい）'));
    const keys = Object.keys(store.best);
    if (!keys.length) c2.appendChild(el('div', 'note', '全問せいかいすると きろくされるよ。'));
    else {
      const ul = el('ul', 'bestli');
      keys.forEach((k) => ul.appendChild(el('li', null, keyLabel(k) + '：' + fmtJa(store.best[k]))));
      c2.appendChild(ul);
    }
    body.appendChild(c2);

    const c3 = el('div', 'card');
    c3.appendChild(el('h2', 'sec', 'れんしゅうの きろく'));
    if (hist.length) {
      const t = el('table', 'rtable');
      const hd = el('tr');
      ['日づけ', 'しゅるい', '点', 'タイム'].forEach((x) => hd.appendChild(el('th', null, x)));
      t.appendChild(hd);
      hist.slice(-20).reverse().forEach((h) => {
        const tr = el('tr');
        tr.appendChild(el('td', null, dateLong(h.t)));
        tr.appendChild(el('td', null, h.retry ? 'まちがい問題' : (TYPE_LABEL[h.type] || h.type)));
        tr.appendChild(el('td', null, h.score + '/' + h.n + (h.perfect ? ' 🌟' : '')));
        tr.appendChild(el('td', null, fmtJa(h.sec)));
        t.appendChild(tr);
      });
      c3.appendChild(t);
    } else c3.appendChild(el('div', 'note', 'まだ ありません。'));
    body.appendChild(c3);
  }

  /* ========== 印刷 ========== */
  let printN = 10;
  function buildPrintSheet() {
    const da = Number(settings.type[0]), db = Number(settings.type[1]);
    const probs = genProblems(da, db, printN, settings.carry);
    const sheet = $('#printSheet');
    sheet.innerHTML = '';
    const title = 'かけ算の筆算（' + TYPE_LABEL[settings.type] + '）';

    function page(withAnswer) {
      const p = el('div', 'psheet' + (withAnswer ? ' ansPage' : ''));
      const head = el('div', 'phead');
      const l = el('span');
      const bt = el('b', null, title + (withAnswer ? ' 【答え】' : ''));
      l.appendChild(bt);
      head.appendChild(l);
      if (!withAnswer) head.appendChild(el('span', null, '名前（　　　　　　　　）　　　　日づけ（　　／　　）　　　　　点（　　／' + printN + '）'));
      p.appendChild(head);
      const g = el('div', 'pgrid');
      probs.forEach((pr, i) => {
        const item = el('div', 'pitem');
        item.appendChild(el('div', 'pnum', '(' + (i + 1) + ')'));
        item.appendChild(buildForm(pr.a, pr.b, { print: true, fill: withAnswer }));
        g.appendChild(item);
      });
      p.appendChild(g);
      return p;
    }
    sheet.appendChild(page(false));
    if ($('#chkAnswer').checked) sheet.appendChild(page(true));
  }

  function openPrint() {
    renderPrintChips();
    buildPrintSheet();
    showScreen('print');
  }
  function renderPrintChips() {
    const box = $('#chips-pn');
    box.innerHTML = '';
    [10, 20].forEach((v) => {
      const b = el('button', 'chip' + (printN === v ? ' on' : ''), v + '問');
      b.type = 'button';
      b.onclick = () => { printN = v; renderPrintChips(); buildPrintSheet(); };
      box.appendChild(b);
    });
  }

  /* ========== イベント登録 ========== */
  $('#btnStart').onclick = startNormal;
  $('#btnRetryMistakes').onclick = startMistakes;
  $('#btnGoRecords').onclick = () => { renderRecords(); showScreen('records'); };
  $('#btnGoPrint').onclick = openPrint;
  $('#btnRecBack').onclick = goHome;
  $('#btnRecReset').onclick = () => {
    if (confirm('きろく（スタンプ・ベストタイム・まちがえた問題）を ぜんぶ けします。よろしいですか？')) {
      store = emptyStore();
      saveSettings();
      renderRecords();
    }
  };
  $('#btnPrintBack').onclick = goHome;
  $('#btnPrintRegen').onclick = buildPrintSheet;
  $('#btnPrintDo').onclick = () => window.print();
  $('#chkAnswer').onchange = buildPrintSheet;

  $('#btnQuit').onclick = () => {
    if (confirm('れんしゅうを やめてホームにもどりますか？（ここまでの記録は のこりません）')) goHome();
  };
  $('#btnCheck').onclick = checkNow;
  $('#btnFix').onclick = startFix;
  $('#btnRecheck').onclick = recheck;
  $('#btnHint').onclick = showHint;
  function updateSoundBtn() { $('#btnSound').textContent = settings.sound ? '🔊' : '🔇'; }
  $('#btnSound').onclick = () => {
    settings.sound = settings.sound ? 0 : 1;
    saveSettings();
    updateSoundBtn();
    sfx('ok');
  };
  updateSoundBtn();
  $('#btnNext').onclick = goNext;
  $('#btnPrev').onclick = goPrev;
  document.querySelectorAll('#numpad button').forEach((b) => {
    b.addEventListener('click', () => press(b.dataset.k));
  });

  document.addEventListener('keydown', (e) => {
    if ($('#screen-play').classList.contains('hidden') || !G || G.finished) return;
    if (e.key >= '0' && e.key <= '9') { press(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { press('bs'); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { moveActive(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { moveActive(1); e.preventDefault(); }
    else if (e.key === 'Enter') {
      const it = G.items[G.idx];
      if (it.fixing) recheck();
      else if (G.mode === 'each' && !it.judged) checkNow();
      else goNext();
      e.preventDefault();
    }
  });

  renderHome();
  showScreen('home');

  // ホーム画面に追加／オフライン用
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* 登録できなくても通常どおり使える */ });
    });
  }
})();
