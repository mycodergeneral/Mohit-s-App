/* ═══════════════════════════════════════════════════════════════
   Famly client — chat, photos, party games, themes & celebrations.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  /* ── persistent identity ── */
  const cid = (() => {
    let v = localStorage.getItem('famly-cid');
    if (!v) {
      v = 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('famly-cid', v);
    }
    return v;
  })();

  const state = {
    selfCid: cid,
    room: null,          // { code, familyName }
    members: [],
    game: null,          // server snapshot
    mode: 'create',      // welcome flow
    avatar: '😀',
    activePane: 'chat',
    quizPicked: null,
    quizTimerRAF: null,
    wordle: { rows: [], current: '', keys: {}, done: false }
  };

  const socket = io();

  /* ═══════════ THEMES ═══════════ */
  const THEMES = ['pixel-pastel', 'cupertino', 'material-you', 'midnight'];
  function applyTheme(t) {
    if (!THEMES.includes(t)) t = 'pixel-pastel';
    document.body.dataset.theme = t;
    localStorage.setItem('famly-theme', t);
    $$('.theme-opt').forEach((b) => b.classList.toggle('on', b.dataset.setTheme === t));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.body).getPropertyValue('--bg-solid').trim() || '#c9b8f0';
  }
  applyTheme(localStorage.getItem('famly-theme'));
  $$('.theme-opt').forEach((b) =>
    b.addEventListener('click', () => { applyTheme(b.dataset.setTheme); blip(660); })
  );

  /* ═══════════ SOUNDS (tiny WebAudio synth) ═══════════ */
  let audioCtx = null;
  function ctx() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    return audioCtx;
  }
  function blip(freq = 520, dur = 0.09, type = 'triangle', gain = 0.06) {
    const c = ctx(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }
  function fanfare() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.08), i * 120)); }
  document.addEventListener('pointerdown', () => ctx() && audioCtx.resume && audioCtx.resume(), { once: true });

  /* ═══════════ TOASTS & FLOATING POINTS ═══════════ */
  function toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    $('#toast-stack').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 2600);
  }
  function floatPoints(text, x, y) {
    const el = document.createElement('div');
    el.className = 'float-pts';
    el.textContent = text;
    el.style.left = (x ?? window.innerWidth / 2 - 30) + 'px';
    el.style.top = (y ?? window.innerHeight / 2) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  /* ═══════════ WELCOME FLOW ═══════════ */
  const AVATARS = ['😀', '😎', '🥰', '🤠', '🐱', '🐶', '🦊', '🐼', '🐸', '🦄', '🐢', '🦋', '🌸', '🌞', '🍕', '🧁', '⚽', '🎸', '👵', '👴', '👩', '👨', '👧', '👦'];
  const avatarGrid = $('#avatar-grid');
  AVATARS.forEach((a, i) => {
    const b = document.createElement('button');
    b.className = 'avatar-opt' + (i === 0 ? ' selected' : '');
    b.type = 'button';
    b.textContent = a;
    b.addEventListener('click', () => {
      $$('.avatar-opt').forEach((x) => x.classList.remove('selected'));
      b.classList.add('selected');
      state.avatar = a;
      blip(700, 0.06);
    });
    avatarGrid.appendChild(b);
  });

  const savedName = localStorage.getItem('famly-name');
  if (savedName) $('#input-name').value = savedName;
  const savedAvatar = localStorage.getItem('famly-avatar');
  if (savedAvatar && AVATARS.includes(savedAvatar)) {
    state.avatar = savedAvatar;
    $$('.avatar-opt').forEach((x) => x.classList.toggle('selected', x.textContent === savedAvatar));
  }

  function showProfileStep(mode) {
    state.mode = mode;
    $('#welcome-step-1').classList.add('hidden');
    $('#welcome-step-profile').classList.remove('hidden');
    $('#create-extra').classList.toggle('hidden', mode !== 'create');
    $('#join-extra').classList.toggle('hidden', mode !== 'join');
    $('#profile-title').textContent = mode === 'create' ? 'Set up your room 🏗️' : "Who's joining? 🎟️";
    $('#form-error').classList.add('hidden');
  }
  $('#btn-goto-create').addEventListener('click', () => showProfileStep('create'));
  $('#btn-goto-join').addEventListener('click', () => showProfileStep('join'));
  $('#btn-back').addEventListener('click', () => {
    $('#welcome-step-profile').classList.add('hidden');
    $('#welcome-step-1').classList.remove('hidden');
  });

  // QR deep-link: /?join=CODE lands straight on the join form.
  const joinParam = new URLSearchParams(location.search).get('join');
  if (joinParam) {
    showProfileStep('join');
    $('#input-code').value = joinParam.toUpperCase().slice(0, 6);
  }

  function formError(msg) {
    const el = $('#form-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  $('#btn-enter').addEventListener('click', () => {
    const name = $('#input-name').value.trim();
    if (!name) return formError('Please tell us your name 💛');
    localStorage.setItem('famly-name', name);
    localStorage.setItem('famly-avatar', state.avatar);

    const payload = { cid, name, avatar: state.avatar };
    if (state.mode === 'create') {
      payload.familyName = $('#input-family').value.trim();
      socket.emit('room:create', payload, onEnterResult);
    } else {
      payload.code = $('#input-code').value.trim().toUpperCase();
      if (payload.code.length !== 6) return formError('Room codes are 6 characters.');
      socket.emit('room:join', payload, onEnterResult);
    }
  });
  $('#input-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });

  function onEnterResult(res) {
    if (res.error) return formError(res.error);
    enterRoom(res.room);
  }

  /* ═══════════ ENTER ROOM ═══════════ */
  function enterRoom(room) {
    state.room = { code: room.code, familyName: room.familyName };
    state.members = room.members;
    state.game = room.game;
    $('#screen-welcome').classList.remove('active');
    $('#screen-app').classList.add('active');
    $('#room-title').textContent = room.familyName || 'Our Family';
    $('#chip-code').textContent = room.code;
    history.replaceState(null, '', '/?join=' + room.code);

    $('#chat-scroll').innerHTML = '';
    room.chat.forEach((m) => renderChatMsg(m, true));
    scrollChat(true);
    renderMembers();
    renderGamesPane();
    fanfare();
  }

  // Auto-rejoin after refresh / disconnect.
  socket.on('connect', () => {
    if (state.room) {
      socket.emit('room:join', {
        cid, code: state.room.code,
        name: localStorage.getItem('famly-name') || 'Someone',
        avatar: state.avatar
      }, (res) => { if (res.ok) enterRoom(res.room); });
    }
  });

  /* ═══════════ TABS ═══════════ */
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const pane = tab.dataset.pane;
      state.activePane = pane;
      $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      $$('.pane').forEach((p) => p.classList.toggle('active', p.id === 'pane-' + pane));
      if (pane === 'chat') { $('#dot-chat').classList.add('hidden'); scrollChat(true); }
      if (pane === 'games') $('#dot-games').classList.add('hidden');
      blip(480, 0.05);
    });
  });
  function pingTab(pane) {
    if (state.activePane !== pane) $('#dot-' + pane)?.classList.remove('hidden');
  }

  /* ═══════════ INVITE / QR ═══════════ */
  function openModal(id) {
    $('#modal-backdrop').classList.remove('hidden');
    $(id).classList.remove('hidden');
  }
  function closeModals() {
    $('#modal-backdrop').classList.add('hidden');
    $$('.modal').forEach((m) => m.classList.add('hidden'));
  }
  $('#modal-backdrop').addEventListener('click', closeModals);
  $$('.modal-close').forEach((b) => b.addEventListener('click', closeModals));

  function openInvite() {
    const url = location.origin + '/?join=' + state.room.code;
    $('#qr-img').src = '/qr?data=' + encodeURIComponent(url);
    $('#invite-code').textContent = state.room.code;
    openModal('#modal-invite');
  }
  $('#btn-invite').addEventListener('click', openInvite);
  $('#btn-invite-2').addEventListener('click', openInvite);
  $('#btn-copy-link').addEventListener('click', async () => {
    const url = location.origin + '/?join=' + state.room.code;
    try {
      if (navigator.share) { await navigator.share({ title: 'Join our Famly room!', url }); return; }
      await navigator.clipboard.writeText(url);
      toast('Invite link copied! 📋');
    } catch (e) { toast('Link: ' + url); }
  });
  $('#chip-code').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(state.room.code); toast('Room code copied! ✨'); } catch (e) {}
  });
  $('#btn-theme').addEventListener('click', () => openModal('#modal-theme'));

  /* ═══════════ CHAT ═══════════ */
  const chatScroll = $('#chat-scroll');
  function nearBottom() {
    return chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 140;
  }
  function scrollChat(force) {
    if (force || nearBottom()) chatScroll.scrollTop = chatScroll.scrollHeight;
  }
  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function renderChatMsg(m, silent) {
    if (m.type === 'system') {
      const el = document.createElement('div');
      el.className = 'msg-system kind-' + (m.kind || 'info');
      el.textContent = m.text;
      chatScroll.appendChild(el);
      if (!silent && m.kind === 'winner') blip(880, 0.15);
      return;
    }
    const own = m.cid === cid;
    const wrap = document.createElement('div');
    wrap.className = 'msg' + (own ? ' own' : '');
    const av = document.createElement('div');
    av.className = 'msg-avatar';
    av.textContent = m.avatar || '👤';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    const name = document.createElement('div');
    name.className = 'msg-name';
    name.textContent = m.name;
    bubble.appendChild(name);
    if (m.type === 'image') {
      const img = document.createElement('img');
      img.className = 'msg-img';
      img.src = m.image;
      img.alt = 'photo from ' + m.name;
      img.addEventListener('click', () => openLightbox(m.image));
      bubble.appendChild(img);
    } else {
      const txt = document.createElement('div');
      txt.className = 'msg-text';
      txt.textContent = m.text;
      bubble.appendChild(txt);
    }
    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = fmtTime(m.ts);
    bubble.appendChild(time);
    wrap.appendChild(av);
    wrap.appendChild(bubble);
    chatScroll.appendChild(wrap);
    if (!silent && !own) blip(600, 0.05, 'sine', 0.04);
  }

  function openLightbox(src) {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:70;background:rgba(20,15,45,.85);display:flex;align-items:center;justify-content:center;cursor:zoom-out;backdrop-filter:blur(4px);animation:fade-in .2s';
    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'max-width:94vw;max-height:92vh;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5)';
    box.appendChild(img);
    box.addEventListener('click', () => box.remove());
    document.body.appendChild(box);
  }

  socket.on('chat:msg', (m) => {
    const keep = nearBottom() || m.cid === cid;
    renderChatMsg(m);
    scrollChat(keep);
    if (m.type !== 'system') pingTab('chat');
    if (m.type === 'system' && (m.kind === 'game' || m.kind === 'winner')) pingTab('games');
  });

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    socket.emit('chat:send', { text });
    input.value = '';
    blip(720, 0.05);
  });

  // Photo sharing — resized client-side so it flies over the wire.
  $('#input-photo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 900;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(url);
      if (dataUrl.length > 3.8e6) return toast('That photo is too large 😅', 'warn');
      socket.emit('chat:image', { dataUrl });
      toast('Photo sent! 📸');
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Could not read that image.', 'err'); };
    img.src = url;
  });

  /* ═══════════ MEMBERS & LEADERBOARD ═══════════ */
  socket.on('room:members', (members) => {
    state.members = members;
    renderMembers();
  });

  function memberOf(cidX) { return state.members.find((m) => m.cid === cidX); }

  function renderMembers() {
    const lb = $('#leaderboard');
    const sorted = [...state.members].sort((a, b) => b.score - a.score || b.wins - a.wins);
    lb.innerHTML = '';
    sorted.forEach((m, i) => {
      const row = document.createElement('div');
      row.className = 'lb-row' + (i === 0 && m.score > 0 ? ' first' : '') + (m.online ? '' : ' lb-offline');
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
      row.innerHTML = `
        <div class="lb-rank">${medal}</div>
        <div class="lb-avatar">${i === 0 && m.score > 0 ? '<span class="lb-crown">👑</span>' : ''}${esc(m.avatar)}</div>
        <div class="lb-name">${esc(m.name)}${m.cid === cid ? ' (you)' : ''}<small>${m.wins} game ${m.wins === 1 ? 'win' : 'wins'}${m.online ? '' : ' · away'}</small></div>
        <div class="lb-pts">${m.score}<small>PTS</small></div>`;
      lb.appendChild(row);
    });

    const top = sorted[0];
    const ribbon = $('#champ-ribbon');
    if (top && top.score > 0 && (!sorted[1] || sorted[1].score < top.score)) {
      ribbon.textContent = `👑 ${top.avatar} ${top.name} is leading the family with ${top.score} pts!`;
      ribbon.classList.remove('hidden');
    } else {
      ribbon.classList.add('hidden');
    }
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ═══════════ GAMES ═══════════ */
  const GAME_META = {
    wordle: { name: 'Wordle Race', emoji: '🟩' },
    flags: { name: 'Flag Guesser', emoji: '🚩' },
    quiz: { name: 'Quote & Trivia Quiz', emoji: '🧠' }
  };

  $$('.game-card').forEach((card) => {
    card.addEventListener('click', () => {
      socket.emit('game:propose', { type: card.dataset.game, settings: {} }, (res) => {
        if (res && res.error) toast(res.error, 'warn');
      });
    });
  });

  socket.on('game:update', (snap) => {
    const wasLobby = state.game && state.game.state === 'lobby';
    state.game = snap;
    renderGamesPane();
    if (snap && snap.state === 'lobby' && !wasLobby && snap.hostCid !== cid) {
      pingTab('games');
      toast(`${GAME_META[snap.type].emoji} ${GAME_META[snap.type].name} lobby is open — come play!`);
      blip(760, 0.12);
    }
  });

  socket.on('toast', ({ text, kind }) => toast(text, kind));

  function renderGamesPane() {
    const home = $('#games-home');
    const lobby = $('#game-lobby');
    const play = $('#game-play');
    const g = state.game;

    if (!g) {
      home.classList.remove('hidden');
      lobby.classList.add('hidden');
      play.classList.add('hidden');
      stopQuizTimer();
      return;
    }
    if (g.state === 'lobby') {
      home.classList.add('hidden');
      play.classList.add('hidden');
      lobby.classList.remove('hidden');
      renderLobby(g);
      return;
    }
    // playing
    home.classList.add('hidden');
    lobby.classList.add('hidden');
    play.classList.remove('hidden');
    if (g.type === 'wordle') renderWordle(g);
    else renderQuiz(g);
  }

  /* ── lobby ── */
  function renderLobby(g) {
    const meta = GAME_META[g.type];
    const isHost = g.hostCid === cid;
    const joined = g.players.includes(cid);
    const host = memberOf(g.hostCid);
    const max = Math.min(g.settings.maxPlayers, 99);

    const playersHtml = g.players.map((p) => {
      const m = memberOf(p);
      return `<div class="lobby-player"><span class="a">${esc(m?.avatar || '👤')}</span><span class="n">${esc(m?.name || '???')}${p === g.hostCid ? ' ⭐' : ''}</span></div>`;
    }).join('') + (g.players.length < max && max <= 8
      ? Array.from({ length: max - g.players.length }, () => '<div class="lobby-player empty"><span class="a">🪑</span><span class="n">open</span></div>').join('')
      : g.players.length < 2 ? '<div class="lobby-player empty"><span class="a">🪑</span><span class="n">open</span></div>' : '');

    const showQuestions = g.type !== 'wordle';
    const settingsHtml = isHost ? `
      <div class="lobby-settings">
        <div><span class="seg-label">Players</span>
          <span class="seg" id="seg-max">
            ${[2, 3, 4, 99].map((n) => `<button data-v="${n}" class="${g.settings.maxPlayers === n ? 'on' : ''}">${n === 99 ? 'All' : n}</button>`).join('')}
          </span>
        </div>
        ${showQuestions ? `<div><span class="seg-label">Questions</span>
          <span class="seg" id="seg-q">
            ${[5, 8, 12].map((n) => `<button data-v="${n}" class="${g.settings.questions === n ? 'on' : ''}">${n}</button>`).join('')}
          </span>
        </div>` : ''}
      </div>` : `<p class="lobby-sub">${esc(host?.name || 'Someone')} is hosting · ${max === 99 ? 'everyone can join' : 'up to ' + max + ' players'}${showQuestions ? ' · ' + g.settings.questions + ' questions' : ''}</p>`;

    const actionsHtml = isHost
      ? `<button class="btn btn-primary btn-big" id="btn-begin" ${g.players.length < 2 ? 'disabled' : ''}>${g.players.length < 2 ? 'Waiting for players…' : `Start with ${g.players.length} players! 🚀`}</button>
         <button class="btn btn-ghost" id="btn-cancel-lobby">Cancel game</button>`
      : joined
        ? `<p class="lobby-sub">You're in! Waiting for ${esc(host?.name || 'the host')} to start…</p>
           <button class="btn btn-ghost" id="btn-leave-lobby">Leave lobby</button>`
        : `<button class="btn btn-primary btn-big" id="btn-join-lobby" ${g.players.length >= max ? 'disabled' : ''}>${g.players.length >= max ? 'Lobby is full 😢' : 'Join the game! 🙋'}</button>`;

    $('#game-lobby').innerHTML = `
      <div class="lobby-card">
        <div class="lobby-game-emoji">${meta.emoji}</div>
        <div>
          <div class="lobby-title">${meta.name}</div>
          <p class="lobby-sub" style="margin-top:4px">needs 2+ players — grab the family!</p>
        </div>
        <div class="lobby-players">${playersHtml}</div>
        ${settingsHtml}
        ${actionsHtml}
        <button class="btn btn-soft" id="btn-lobby-invite">📲 Invite more family</button>
      </div>`;

    $('#btn-begin')?.addEventListener('click', () => {
      socket.emit('game:begin', (res) => { if (res && res.error) toast(res.error, 'warn'); });
    });
    $('#btn-cancel-lobby')?.addEventListener('click', () => socket.emit('game:leaveLobby'));
    $('#btn-leave-lobby')?.addEventListener('click', () => socket.emit('game:leaveLobby'));
    $('#btn-join-lobby')?.addEventListener('click', () => { socket.emit('game:joinLobby'); blip(700); });
    $('#btn-lobby-invite')?.addEventListener('click', openInvite);
    $('#seg-max')?.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => socket.emit('game:settings', { maxPlayers: Number(b.dataset.v) })));
    $('#seg-q')?.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => socket.emit('game:settings', { questions: Number(b.dataset.v) })));
  }

  /* ── quiz (flags + trivia) ── */
  function standingsChips(standings) {
    if (!standings) return '';
    return `<div class="play-standings-mini">${standings.slice(0, 4).map((s, i) =>
      `<span class="mini-chip ${i === 0 && s.points > 0 ? 'leader' : ''}">${i === 0 && s.points > 0 ? '👑' : ''}${esc(s.avatar)} ${s.points}</span>`
    ).join('')}</div>`;
  }

  function renderQuiz(g) {
    const play = $('#game-play');
    const q = g.quiz;
    if (!q) return;
    const iAmPlaying = g.players.includes(cid);
    const meta = GAME_META[g.type];

    const standings = q.standings ||
      (g.scores ? g.scores.map(([pcid, pts]) => {
        const m = memberOf(pcid);
        return { cid: pcid, name: m?.name, avatar: m?.avatar || '👤', points: pts };
      }).sort((a, b) => b.points - a.points) : null);

    if (q.phase === 'question') {
      state.quizPicked = null;
      const optsHtml = q.options.map((o, i) =>
        `<button class="q-opt" data-i="${i}" ${iAmPlaying ? '' : 'disabled'}>${esc(o)}</button>`).join('');
      play.innerHTML = `
        <div class="play-head">
          <span class="play-progress">${meta.emoji} Q${q.qIndex + 1}/${q.total}</span>
          ${standingsChips(standings)}
        </div>
        <div class="timerbar"><div class="timerbar-fill" id="timer-fill"></div></div>
        <div class="q-card">
          <div class="q-cat">${q.cat === 'flag' ? '🚩 flag guesser' : q.cat === 'quote' ? '💬 who said it?' : '🧠 trivia'}</div>
          ${q.flag ? `<div class="q-flag">${q.flag}</div>` : ''}
          <div class="q-prompt">${esc(q.prompt)}</div>
        </div>
        <div class="q-options">${optsHtml}</div>
        <p class="q-waiting" id="q-waiting">${iAmPlaying ? 'Quick — speed earns bonus points! ⚡' : 'You are spectating this round 🍿'}</p>`;

      play.querySelectorAll('.q-opt').forEach((b) => {
        b.addEventListener('click', () => {
          if (state.quizPicked !== null) return;
          state.quizPicked = Number(b.dataset.i);
          play.querySelectorAll('.q-opt').forEach((x) => { x.disabled = true; x.classList.toggle('picked', x === b); });
          socket.emit('quiz:answer', { choice: state.quizPicked });
          $('#q-waiting').textContent = 'Locked in! Waiting for the others… 🤞';
          blip(640, 0.08);
        });
      });
      startQuizTimer(q.endsAt);
    } else {
      // reveal
      stopQuizTimer();
      const myResult = q.results?.find((r) => r.cid === cid);
      const optsHtml = q.options.map((o, i) => {
        let cls = 'q-opt';
        if (i === q.correctIndex) cls += ' reveal-correct';
        else if (myResult && myResult.choice === i) cls += ' reveal-wrong';
        return `<button class="${cls}" disabled>${esc(o)}${i === q.correctIndex ? ' ✓' : ''}</button>`;
      }).join('');
      const ptsHtml = (q.results || []).map((r) => {
        const m = memberOf(r.cid);
        return `<span class="pt-chip ${r.points > 0 ? 'gain' : ''}">${esc(m?.avatar || '👤')} ${r.points > 0 ? '+' + r.points : r.choice === null ? '💤 0' : '✗ 0'}</span>`;
      }).join('');
      play.innerHTML = `
        <div class="play-head">
          <span class="play-progress">${meta.emoji} Q${q.qIndex + 1}/${q.total}</span>
          ${standingsChips(q.standings)}
        </div>
        <div class="q-card">
          <div class="q-cat">${q.cat === 'flag' ? '🚩 flag guesser' : q.cat === 'quote' ? '💬 who said it?' : '🧠 trivia'}</div>
          ${q.flag ? `<div class="q-flag">${q.flag}</div>` : ''}
          <div class="q-prompt">${esc(q.prompt)}</div>
        </div>
        <div class="q-options">${optsHtml}</div>
        <div class="reveal-points">${ptsHtml}</div>`;

      if (myResult) {
        if (myResult.points > 0) { floatPoints('+' + myResult.points); blip(880, 0.14); blip(1100, 0.14); }
        else blip(220, 0.18, 'sawtooth', 0.03);
      }
    }
  }

  socket.on('game:answered', ({ answered, of }) => {
    const w = $('#q-waiting');
    if (w && state.quizPicked !== null) w.textContent = `Locked in! ${answered}/${of} answered… 🤞`;
  });

  function startQuizTimer(endsAt) {
    stopQuizTimer();
    const total = 15000;
    const tick = () => {
      const fill = $('#timer-fill');
      if (!fill) return;
      const left = Math.max(0, endsAt - Date.now());
      fill.style.width = (left / total * 100) + '%';
      fill.classList.toggle('hurry', left < 4000 && left > 0);
      if (left > 0) state.quizTimerRAF = requestAnimationFrame(tick);
    };
    state.quizTimerRAF = requestAnimationFrame(tick);
  }
  function stopQuizTimer() {
    if (state.quizTimerRAF) cancelAnimationFrame(state.quizTimerRAF);
    state.quizTimerRAF = null;
  }

  /* ── wordle race ── */
  const KBD_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '⏎ZXCVBNM⌫'];

  function renderWordle(g) {
    const play = $('#game-play');
    const iAmPlaying = g.players.includes(cid);
    if (state.wordle.startedAt !== g.wordle?.startedAt) {
      state.wordle = { rows: [], current: '', keys: {}, done: !iAmPlaying, startedAt: g.wordle?.startedAt };
    }

    const rivals = g.players.filter((p) => p !== cid);
    const boards = g.wordle?.boards || {};

    play.innerHTML = `
      <div class="play-head">
        <span class="play-progress">🟩 Wordle Race</span>
        <span class="play-progress" id="wordle-clock"></span>
      </div>
      <div class="wordle-wrap">
        <div class="wordle-rivals" id="wordle-rivals"></div>
        ${iAmPlaying ? `
          <div class="wordle-grid" id="wordle-grid"></div>
          <div class="wordle-msg" id="wordle-msg">Guess the 5-letter word — fastest solver gets a bonus! 🏁</div>
          <div class="wordle-kbd" id="wordle-kbd"></div>`
          : '<p class="q-waiting">You are spectating — cheer them on in chat! 🍿</p>'}
      </div>`;

    if (iAmPlaying) {
      buildWordleGrid();
      buildKeyboard();
      paintWordle();
    }
    paintRivals(boards, rivals);
    startWordleClock(g.wordle?.endsAt);
  }

  function buildWordleGrid() {
    const grid = $('#wordle-grid');
    grid.innerHTML = '';
    for (let r = 0; r < 6; r++) {
      const row = document.createElement('div');
      row.className = 'wordle-row';
      for (let c = 0; c < 5; c++) {
        const t = document.createElement('div');
        t.className = 'wtile';
        t.id = `wt-${r}-${c}`;
        row.appendChild(t);
      }
      grid.appendChild(row);
    }
  }

  function buildKeyboard() {
    const kbd = $('#wordle-kbd');
    kbd.innerHTML = '';
    KBD_ROWS.forEach((rowStr) => {
      const row = document.createElement('div');
      row.className = 'kbd-row';
      [...rowStr].forEach((ch) => {
        const k = document.createElement('button');
        k.className = 'key' + (ch === '⏎' || ch === '⌫' ? ' wide' : '');
        k.textContent = ch === '⏎' ? 'enter' : ch;
        k.dataset.key = ch;
        k.addEventListener('click', () => handleKey(ch));
        row.appendChild(k);
      });
      kbd.appendChild(row);
    });
  }

  function handleKey(ch) {
    const w = state.wordle;
    if (w.done) return;
    if (ch === '⌫') { w.current = w.current.slice(0, -1); }
    else if (ch === '⏎') { submitWordleGuess(); return; }
    else if (/^[A-Z]$/.test(ch) && w.current.length < 5) { w.current += ch; blip(500, 0.03, 'square', 0.025); }
    paintWordle();
  }

  document.addEventListener('keydown', (e) => {
    if (!state.game || state.game.type !== 'wordle' || state.game.state !== 'playing') return;
    if (state.activePane !== 'games') return;
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Enter') handleKey('⏎');
    else if (e.key === 'Backspace') handleKey('⌫');
    else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
  });

  function paintWordle() {
    const w = state.wordle;
    for (let r = 0; r < 6; r++) {
      const done = w.rows[r];
      for (let c = 0; c < 5; c++) {
        const t = $(`#wt-${r}-${c}`);
        if (!t) return;
        t.className = 'wtile';
        t.textContent = '';
        if (done) {
          t.textContent = done.guess[c];
          t.classList.add(done.colors[c], 'flip');
        } else if (r === w.rows.length) {
          const ch = w.current[c];
          if (ch) { t.textContent = ch; t.classList.add('filled'); }
        }
      }
    }
    // keyboard colours
    $$('#wordle-kbd .key').forEach((k) => {
      const ch = k.dataset.key;
      k.classList.remove('correct', 'present', 'absent');
      if (state.wordle.keys[ch]) k.classList.add(state.wordle.keys[ch]);
    });
  }

  const KEY_RANK = { absent: 1, present: 2, correct: 3 };
  function submitWordleGuess() {
    const w = state.wordle;
    if (w.current.length !== 5) {
      $('#wordle-msg').textContent = 'Need 5 letters! ✋';
      blip(240, 0.1, 'sawtooth', 0.03);
      return;
    }
    const guess = w.current;
    socket.emit('wordle:guess', { guess }, (res) => {
      if (res.error) { $('#wordle-msg').textContent = res.error; return; }
      w.rows.push({ guess, colors: res.colors });
      w.current = '';
      [...guess].forEach((ch, i) => {
        const col = res.colors[i];
        if (!w.keys[ch] || KEY_RANK[col] > KEY_RANK[w.keys[ch]]) w.keys[ch] = col;
      });
      paintWordle();
      if (res.solved) {
        w.done = true;
        $('#wordle-msg').textContent = `🎉 You got it! +${res.points} points!`;
        floatPoints('+' + res.points);
        fanfare();
      } else if (res.finished) {
        w.done = true;
        $('#wordle-msg').textContent = 'Out of guesses 💔 — cheer the others on!';
        blip(200, 0.25, 'sawtooth', 0.04);
      } else {
        blip(560, 0.06);
      }
    });
  }

  function paintRivals(boards, rivals) {
    const wrap = $('#wordle-rivals');
    if (!wrap) return;
    wrap.innerHTML = rivals.map((p) => {
      const m = memberOf(p);
      const b = boards[p] || { rows: [], solved: false };
      const rows = Array.from({ length: 6 }, (_, r) => {
        const colors = b.rows[r];
        return `<div class="rival-row">${Array.from({ length: 5 }, (_, c) =>
          `<span class="rtile ${colors ? colors[c] : ''}"></span>`).join('')}</div>`;
      }).join('');
      return `<div class="rival ${b.solved ? 'done' : ''}">
        <div class="rival-grid">${rows}</div>
        <span class="rival-name">${esc(m?.avatar || '')} ${esc(m?.name || '???')}</span>
      </div>`;
    }).join('');
  }

  socket.on('wordle:progress', ({ boards }) => {
    if (!state.game || state.game.type !== 'wordle') return;
    if (!state.game.wordle) state.game.wordle = {};
    state.game.wordle.boards = boards;
    paintRivals(boards, state.game.players.filter((p) => p !== cid));
  });

  let wordleClockInt = null;
  function startWordleClock(endsAt) {
    clearInterval(wordleClockInt);
    if (!endsAt) return;
    const tick = () => {
      const el = $('#wordle-clock');
      if (!el) return clearInterval(wordleClockInt);
      const left = Math.max(0, endsAt - Date.now());
      const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      el.textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
    };
    tick();
    wordleClockInt = setInterval(tick, 1000);
  }

  /* ═══════════ GAME OVER & CELEBRATION ═══════════ */
  socket.on('game:over', (payload) => {
    state.game = null;
    stopQuizTimer();
    clearInterval(wordleClockInt);
    renderGamesPane();
    showCelebration(payload);
  });

  function showCelebration({ type, standings, winner, tie, word }) {
    const card = $('#celebrate-card');
    const meta = GAME_META[type];
    const podium = standings.slice(0, 4).map((s, i) =>
      `<div class="podium-row"><span>${['🥇', '🥈', '🥉', '4️⃣'][i]}</span><span>${esc(s.avatar)} ${esc(s.name)}</span><span class="pp">+${s.points}</span></div>`).join('');

    card.innerHTML = `
      <div class="celebrate-trophy">${winner ? '🏆' : tie ? '🤝' : '🎮'}</div>
      <div class="celebrate-title">${winner ? 'WINNER!' : tie ? "IT'S A TIE!" : 'GAME OVER'}</div>
      ${winner ? `<div class="celebrate-winner">${esc(winner.avatar)} ${esc(winner.name)}</div>
                  <div class="celebrate-pts">takes ${meta.name} with ${winner.points} pts!</div>` :
        `<div class="celebrate-pts">${meta.name} is done!</div>`}
      ${word ? `<div class="celebrate-pts">The word was <strong>${esc(word)}</strong></div>` : ''}
      <div class="celebrate-podium">${podium}</div>
      <button class="btn btn-primary btn-big" id="btn-celebrate-close">Back to the party! 🎈</button>`;

    $('#celebrate').classList.remove('hidden');
    if (winner) { fanfare(); setTimeout(fanfare, 500); }
    runConfetti(winner ? 4200 : 1800);
    $('#btn-celebrate-close').addEventListener('click', closeCelebration);
    setTimeout(closeCelebration, 9000);
  }

  function closeCelebration() {
    $('#celebrate').classList.add('hidden');
    confettiOn = false;
  }

  /* ── confetti ── */
  let confettiOn = false;
  function runConfetti(duration) {
    const canvas = $('#confetti-canvas');
    const c = canvas.getContext('2d');
    canvas.width = innerWidth; canvas.height = innerHeight;
    const COLORS = ['#a78bfa', '#f9a8d4', '#6ee7c8', '#fcd34d', '#93c5fd', '#fda4af'];
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.5,
      w: 6 + Math.random() * 8,
      h: 8 + Math.random() * 8,
      vy: 2 + Math.random() * 3.5,
      vx: -1.5 + Math.random() * 3,
      rot: Math.random() * Math.PI,
      vr: -0.12 + Math.random() * 0.24,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    }));
    confettiOn = true;
    const until = Date.now() + duration;
    (function frame() {
      if (!confettiOn) { c.clearRect(0, 0, canvas.width, canvas.height); return; }
      c.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach((p) => {
        p.y += p.vy; p.x += p.vx + Math.sin(p.y / 40); p.rot += p.vr;
        if (p.y > canvas.height + 20 && Date.now() < until) { p.y = -20; p.x = Math.random() * canvas.width; }
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = p.color; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        c.restore();
      });
      if (Date.now() < until || parts.some((p) => p.y < canvas.height + 20)) requestAnimationFrame(frame);
      else c.clearRect(0, 0, canvas.width, canvas.height);
    })();
  }

  window.addEventListener('resize', () => {
    const canvas = $('#confetti-canvas');
    canvas.width = innerWidth; canvas.height = innerHeight;
  });
})();
