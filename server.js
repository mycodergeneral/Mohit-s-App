/*
 * Famly — a cozy online gathering space for families.
 * Express + Socket.IO server: rooms, chat, photo sharing and
 * three competitive party games (Wordle Race, Flag Guesser, Quiz).
 */
const path = require('path');
const http = require('http');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const WORDS = require('./data/words');
const { COUNTRIES, codeToEmoji } = require('./data/flags');
const TRIVIA = require('./data/trivia');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 6e6 });

app.use(express.static(path.join(__dirname, 'public')));

// QR code as crisp SVG for the invite modal.
app.get('/qr', async (req, res) => {
  try {
    const data = String(req.query.data || '').slice(0, 500);
    if (!data) return res.status(400).send('missing data');
    const svg = await QRCode.toString(data, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#3b2f5b', light: '#0000' }
    });
    res.type('image/svg+xml').send(svg);
  } catch (e) {
    res.status(500).send('qr error');
  }
});

/* ──────────────────────────── state ──────────────────────────── */

const rooms = new Map(); // code -> room

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeCode() {
  let code = '';
  do {
    code = Array.from({ length: 6 }, () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeRoom(code, familyName) {
  return {
    code,
    familyName: familyName || 'Our Family',
    members: new Map(), // cid -> member
    chat: [],           // last 60 messages
    game: null,
    createdAt: Date.now()
  };
}

function publicMembers(room) {
  return [...room.members.values()].map((m) => ({
    cid: m.cid,
    name: m.name,
    avatar: m.avatar,
    score: m.score,
    online: m.online,
    wins: m.wins
  }));
}

function roomSnapshot(room) {
  return {
    code: room.code,
    familyName: room.familyName,
    members: publicMembers(room),
    chat: room.chat.slice(-60),
    game: room.game ? gameSnapshot(room) : null
  };
}

function pushChat(room, msg) {
  msg.id = Math.random().toString(36).slice(2, 10);
  msg.ts = Date.now();
  room.chat.push(msg);
  if (room.chat.length > 120) room.chat.splice(0, room.chat.length - 120);
  io.to(room.code).emit('chat:msg', msg);
}

function systemMsg(room, text, kind) {
  pushChat(room, { type: 'system', kind: kind || 'info', text });
}

function emitMembers(room) {
  io.to(room.code).emit('room:members', publicMembers(room));
}

function memberBySocket(socket) {
  const { code, cid } = socket.data;
  const room = rooms.get(code);
  if (!room) return {};
  return { room, member: room.members.get(cid) };
}

/* ──────────────────────────── games ──────────────────────────── */

const GAME_META = {
  wordle: { name: 'Wordle Race', emoji: '🟩' },
  flags: { name: 'Flag Guesser', emoji: '🚩' },
  quiz: { name: 'Quote & Trivia Quiz', emoji: '🧠' }
};

const QUESTION_MS = 15000;
const REVEAL_MS = 3500;
const WORDLE_CAP_MS = 4 * 60 * 1000;

function gameSnapshot(room) {
  const g = room.game;
  if (!g) return null;
  const base = {
    type: g.type,
    state: g.state,
    hostCid: g.hostCid,
    players: [...g.players],
    settings: g.settings
  };
  if (g.state === 'playing') {
    if (g.type === 'wordle') {
      base.wordle = {
        startedAt: g.startedAt,
        endsAt: g.endsAt,
        boards: wordleBoardsPublic(g)
      };
    } else {
      base.quiz = g.current
        ? { ...g.current, qIndex: g.qIndex, total: g.questions.length }
        : null;
      base.scores = [...g.scores.entries()];
    }
  }
  return base;
}

function clearGameTimers(room) {
  const g = room.game;
  if (!g) return;
  if (g.timer) clearTimeout(g.timer);
  g.timer = null;
}

/* ── lobby ── */

function proposeGame(room, member, type, settings) {
  if (room.game && room.game.state === 'playing') return 'A game is already in progress.';
  if (!GAME_META[type]) return 'Unknown game.';
  clearGameTimers(room);
  const maxPlayers = Math.max(2, Math.min(Number(settings?.maxPlayers) || 99, 99));
  const questions = [5, 8, 12].includes(Number(settings?.questions)) ? Number(settings.questions) : 8;
  room.game = {
    type,
    state: 'lobby',
    hostCid: member.cid,
    settings: { maxPlayers, questions },
    players: new Set([member.cid]),
    timer: null
  };
  systemMsg(room, `${member.avatar} ${member.name} wants to play ${GAME_META[type].emoji} ${GAME_META[type].name}! Tap Games to join.`, 'game');
  io.to(room.code).emit('game:update', gameSnapshot(room));
  return null;
}

function beginGame(room) {
  const g = room.game;
  g.players = new Set([...g.players].filter((cid) => {
    const m = room.members.get(cid);
    return m && m.online;
  }));
  if (g.players.size < 2) return 'You need at least 2 players.';

  g.state = 'playing';
  g.scores = new Map([...g.players].map((cid) => [cid, 0]));

  const names = [...g.players].map((cid) => room.members.get(cid)?.name).filter(Boolean);
  systemMsg(room, `${GAME_META[g.type].emoji} ${GAME_META[g.type].name} started — ${names.join(' vs ')}. Good luck!`, 'game');

  if (g.type === 'wordle') startWordle(room);
  else startQuiz(room);
  return null;
}

/* ── quiz engine (flags + trivia share it) ── */

function buildQuestions(type, count) {
  if (type === 'flags') {
    return shuffle(COUNTRIES).slice(0, count).map(([code, name]) => {
      const wrong = shuffle(COUNTRIES.filter(([c]) => c !== code)).slice(0, 3).map(([, n]) => n);
      const options = shuffle([name, ...wrong]);
      return {
        cat: 'flag',
        prompt: 'Which country does this flag belong to?',
        flag: codeToEmoji(code),
        options,
        correctIndex: options.indexOf(name)
      };
    });
  }
  return shuffle(TRIVIA).slice(0, count).map((t) => {
    const options = shuffle([t.correct, ...t.wrong]);
    return {
      cat: t.cat,
      prompt: t.q,
      options,
      correctIndex: options.indexOf(t.correct)
    };
  });
}

function startQuiz(room) {
  const g = room.game;
  g.questions = buildQuestions(g.type, g.settings.questions);
  g.qIndex = -1;
  nextQuestion(room);
}

function nextQuestion(room) {
  const g = room.game;
  if (!g || g.state !== 'playing') return;
  g.qIndex += 1;
  if (g.qIndex >= g.questions.length) return endGame(room);

  const q = g.questions[g.qIndex];
  g.answers = new Map(); // cid -> {choice, ms}
  g.phase = 'question';
  g.questionStart = Date.now();
  g.current = {
    phase: 'question',
    cat: q.cat,
    prompt: q.prompt,
    flag: q.flag || null,
    options: q.options,
    endsAt: g.questionStart + QUESTION_MS
  };
  io.to(room.code).emit('game:update', gameSnapshot(room));
  g.timer = setTimeout(() => revealAnswer(room), QUESTION_MS + 300);
}

function submitAnswer(room, member, choice) {
  const g = room.game;
  if (!g || g.state !== 'playing' || g.type === 'wordle' || g.phase !== 'question') return;
  if (!g.players.has(member.cid) || g.answers.has(member.cid)) return;
  const ms = Date.now() - g.questionStart;
  if (ms > QUESTION_MS + 500) return;
  g.answers.set(member.cid, { choice: Number(choice), ms });
  io.to(room.code).emit('game:answered', { cid: member.cid, answered: g.answers.size, of: g.players.size });
  const onlinePlayers = [...g.players].filter((cid) => room.members.get(cid)?.online);
  if (onlinePlayers.every((cid) => g.answers.has(cid))) {
    clearGameTimers(room);
    revealAnswer(room);
  }
}

function revealAnswer(room) {
  const g = room.game;
  if (!g || g.state !== 'playing' || g.phase !== 'question') return;
  clearGameTimers(room);
  g.phase = 'reveal';

  const q = g.questions[g.qIndex];
  const results = [];
  for (const cid of g.players) {
    const a = g.answers.get(cid);
    let points = 0;
    if (a && a.choice === q.correctIndex) {
      const speed = Math.max(0, 1 - a.ms / QUESTION_MS);
      points = 100 + Math.round(100 * speed);
    }
    g.scores.set(cid, (g.scores.get(cid) || 0) + points);
    results.push({ cid, choice: a ? a.choice : null, points });
  }

  g.current = {
    phase: 'reveal',
    cat: q.cat,
    prompt: q.prompt,
    flag: q.flag || null,
    options: q.options,
    correctIndex: q.correctIndex,
    results,
    standings: standings(room)
  };
  io.to(room.code).emit('game:update', gameSnapshot(room));
  g.timer = setTimeout(() => nextQuestion(room), REVEAL_MS);
}

function standings(room) {
  const g = room.game;
  return [...g.scores.entries()]
    .map(([cid, pts]) => {
      const m = room.members.get(cid);
      return { cid, name: m?.name || '???', avatar: m?.avatar || '👤', points: pts };
    })
    .sort((a, b) => b.points - a.points);
}

/* ── wordle race ── */

function startWordle(room) {
  const g = room.game;
  g.word = WORDS[Math.floor(Math.random() * WORDS.length)].toUpperCase();
  g.startedAt = Date.now();
  g.endsAt = g.startedAt + WORDLE_CAP_MS;
  g.solveOrder = [];
  g.boards = new Map();
  for (const cid of g.players) {
    g.boards.set(cid, { rows: [], solved: false, finished: false });
  }
  io.to(room.code).emit('game:update', gameSnapshot(room));
  g.timer = setTimeout(() => endGame(room), WORDLE_CAP_MS + 500);
}

function wordleBoardsPublic(g) {
  // Opponents only ever see colours, never letters.
  const out = {};
  for (const [cid, b] of g.boards) {
    out[cid] = {
      rows: b.rows.map((r) => r.colors),
      solved: b.solved,
      finished: b.finished
    };
  }
  return out;
}

function scoreWordleGuess(word, guess) {
  const colors = Array(5).fill('absent');
  const remaining = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === word[i]) colors[i] = 'correct';
    else remaining[word[i]] = (remaining[word[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (colors[i] !== 'correct' && remaining[guess[i]] > 0) {
      colors[i] = 'present';
      remaining[guess[i]] -= 1;
    }
  }
  return colors;
}

function wordleGuess(room, member, rawGuess, cb) {
  const g = room.game;
  if (!g || g.state !== 'playing' || g.type !== 'wordle') return cb({ error: 'No Wordle running.' });
  const board = g.boards.get(member.cid);
  if (!board) return cb({ error: 'You are not in this game.' });
  if (board.finished) return cb({ error: 'Your board is finished!' });

  const guess = String(rawGuess || '').trim().toUpperCase();
  if (!/^[A-Z]{5}$/.test(guess)) return cb({ error: 'Enter a 5-letter word.' });

  const colors = scoreWordleGuess(g.word, guess);
  board.rows.push({ guess, colors });

  let points = 0;
  if (guess === g.word) {
    board.solved = true;
    board.finished = true;
    g.solveOrder.push(member.cid);
    const guessPts = [600, 500, 400, 300, 200, 120][board.rows.length - 1] || 100;
    const orderBonus = [150, 75, 40][g.solveOrder.length - 1] || 0;
    points = guessPts + orderBonus;
    g.scores.set(member.cid, points);
    systemMsg(room, `🎉 ${member.avatar} ${member.name} cracked the word in ${board.rows.length} ${board.rows.length === 1 ? 'try' : 'tries'}! +${points} pts`, 'game');
  } else if (board.rows.length >= 6) {
    board.finished = true;
    g.scores.set(member.cid, 0);
  }

  io.to(room.code).emit('wordle:progress', {
    cid: member.cid,
    boards: wordleBoardsPublic(g),
    standings: standings(room)
  });

  const done = [...g.players].every((cid) => {
    const b = g.boards.get(cid);
    const m = room.members.get(cid);
    return b.finished || !m || !m.online;
  });
  cb({ colors, solved: board.solved, finished: board.finished, points });
  if (done) endGame(room);
}

/* ── game end ── */

function endGame(room) {
  const g = room.game;
  if (!g || g.state !== 'playing') return;
  clearGameTimers(room);

  const finalStandings = standings(room);
  for (const s of finalStandings) {
    const m = room.members.get(s.cid);
    if (m) m.score += s.points;
  }

  const top = finalStandings[0];
  const isTie = finalStandings.length > 1 && finalStandings[1].points === top.points && top.points > 0;
  const winner = top && top.points > 0 && !isTie ? top : null;
  if (winner) {
    const m = room.members.get(winner.cid);
    if (m) m.wins += 1;
  }

  const meta = GAME_META[g.type];
  if (winner) {
    systemMsg(room, `🏆 ${winner.avatar} ${winner.name} wins ${meta.name} with ${winner.points} points!`, 'winner');
  } else if (isTie) {
    systemMsg(room, `🤝 ${meta.name} ends in a tie — rematch time!`, 'winner');
  } else {
    systemMsg(room, `${meta.emoji} ${meta.name} is over. No points this time — try again!`, 'game');
  }

  const payload = {
    type: g.type,
    standings: finalStandings,
    winner,
    tie: isTie,
    word: g.type === 'wordle' ? g.word : undefined
  };
  room.game = null;
  io.to(room.code).emit('game:over', payload);
  emitMembers(room);
}

/* ──────────────────────────── sockets ──────────────────────────── */

io.on('connection', (socket) => {
  socket.on('room:create', ({ cid, name, avatar, familyName }, cb) => {
    if (!cid || !String(name || '').trim()) return cb({ error: 'Please tell us your name.' });
    const code = makeCode();
    const room = makeRoom(code, String(familyName || '').trim().slice(0, 24));
    rooms.set(code, room);
    joinRoom(socket, room, { cid, name, avatar }, cb, true);
  });

  socket.on('room:join', ({ cid, code, name, avatar }, cb) => {
    const room = rooms.get(String(code || '').trim().toUpperCase());
    if (!room) return cb({ error: 'Room not found — double-check the code.' });
    if (!cid || !String(name || '').trim()) return cb({ error: 'Please tell us your name.' });
    joinRoom(socket, room, { cid, name, avatar }, cb, false);
  });

  socket.on('chat:send', ({ text }) => {
    const { room, member } = memberBySocket(socket);
    if (!room || !member) return;
    const t = String(text || '').trim().slice(0, 800);
    if (!t) return;
    pushChat(room, { type: 'text', cid: member.cid, name: member.name, avatar: member.avatar, text: t });
  });

  socket.on('chat:image', ({ dataUrl }) => {
    const { room, member } = memberBySocket(socket);
    if (!room || !member) return;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/') || dataUrl.length > 4e6) return;
    pushChat(room, { type: 'image', cid: member.cid, name: member.name, avatar: member.avatar, image: dataUrl });
  });

  socket.on('game:propose', ({ type, settings }, cb) => {
    const { room, member } = memberBySocket(socket);
    if (!room || !member) return;
    const err = proposeGame(room, member, type, settings);
    cb && cb(err ? { error: err } : { ok: true });
  });

  socket.on('game:joinLobby', () => {
    const { room, member } = memberBySocket(socket);
    if (!room || !member || !room.game || room.game.state !== 'lobby') return;
    if (room.game.players.size >= room.game.settings.maxPlayers) {
      socket.emit('toast', { text: 'The lobby is full!', kind: 'warn' });
      return;
    }
    room.game.players.add(member.cid);
    io.to(room.code).emit('game:update', gameSnapshot(room));
  });

  socket.on('game:leaveLobby', () => {
    const { room, member } = memberBySocket(socket);
    if (!room || !member || !room.game || room.game.state !== 'lobby') return;
    room.game.players.delete(member.cid);
    if (member.cid === room.game.hostCid || room.game.players.size === 0) {
      room.game = null;
      io.to(room.code).emit('game:update', null);
    } else {
      io.to(room.code).emit('game:update', gameSnapshot(room));
    }
  });

  socket.on('game:settings', ({ maxPlayers, questions }) => {
    const { room, member } = memberBySocket(socket);
    if (!room || !member || !room.game || room.game.state !== 'lobby') return;
    if (member.cid !== room.game.hostCid) return;
    const g = room.game;
    if (maxPlayers !== undefined) g.settings.maxPlayers = Math.max(2, Math.min(Number(maxPlayers) || 99, 99));
    if ([5, 8, 12].includes(Number(questions))) g.settings.questions = Number(questions);
    io.to(room.code).emit('game:update', gameSnapshot(room));
  });

  socket.on('game:begin', (cb) => {
    const { room, member } = memberBySocket(socket);
    if (!room || !member || !room.game || room.game.state !== 'lobby') return;
    if (member.cid !== room.game.hostCid) return;
    const err = beginGame(room);
    cb && cb(err ? { error: err } : { ok: true });
  });

  socket.on('quiz:answer', ({ choice }) => {
    const { room, member } = memberBySocket(socket);
    if (!room || !member) return;
    submitAnswer(room, member, choice);
  });

  socket.on('wordle:guess', ({ guess }, cb) => {
    const { room, member } = memberBySocket(socket);
    if (!room || !member) return cb && cb({ error: 'Not in a room.' });
    wordleGuess(room, member, guess, cb || (() => {}));
  });

  socket.on('disconnect', () => {
    const { room, member } = memberBySocket(socket);
    if (!room || !member) return;
    member.online = false;
    member.socketId = null;
    emitMembers(room);
    if (room.game && room.game.state === 'lobby') {
      room.game.players.delete(member.cid);
      if (member.cid === room.game.hostCid || room.game.players.size === 0) {
        room.game = null;
        io.to(room.code).emit('game:update', null);
      } else {
        io.to(room.code).emit('game:update', gameSnapshot(room));
      }
    }
    // Clean up empty rooms after a grace period so refreshes survive.
    setTimeout(() => {
      const r = rooms.get(room.code);
      if (r && [...r.members.values()].every((m) => !m.online)) {
        clearGameTimers(r);
        rooms.delete(r.code);
      }
    }, 10 * 60 * 1000);
  });
});

function joinRoom(socket, room, { cid, name, avatar }, cb, isCreator) {
  const cleanName = String(name).trim().slice(0, 20);
  const cleanAvatar = String(avatar || '😀').slice(0, 8);

  let member = room.members.get(cid);
  const returning = Boolean(member);
  if (member) {
    member.name = cleanName;
    member.avatar = cleanAvatar;
    member.online = true;
    member.socketId = socket.id;
  } else {
    member = { cid, name: cleanName, avatar: cleanAvatar, score: 0, wins: 0, online: true, socketId: socket.id };
    room.members.set(cid, member);
  }

  socket.data.code = room.code;
  socket.data.cid = cid;
  socket.join(room.code);

  cb({ ok: true, selfCid: cid, room: roomSnapshot(room) });
  emitMembers(room);
  if (!returning && !isCreator) {
    systemMsg(room, `👋 ${member.avatar} ${member.name} joined the family room!`, 'join');
  } else if (isCreator) {
    systemMsg(room, `✨ ${member.avatar} ${member.name} created “${room.familyName}” — invite everyone with the QR code!`, 'join');
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🏡 Famly is running → http://localhost:${PORT}`);
});
