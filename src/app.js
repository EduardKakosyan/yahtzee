import {
  CATEGORIES, UPPER, ROUNDS, MAX_PLAYERS,
  newGame, rollDice, toggleHold, record, undo,
  allowedBoxes, potential, potentialRating,
  upperSubtotal, upperBonus, grandTotal, isYahtzee,
  currentPlayer, roundOf, standings, winners,
  sessionFromGame, mergeSession,
  ENTRY_LEN, emptyEntry, entryCount, entryComplete, turnTouched,
  setEntryFace, clearEntry,
} from './rules.js';

/* ────────────────────────── state ────────────────────────── */
const KEY = 'yahtzee.state.v1';
const PREF_KEY = 'yahtzee.prefs.v1';
const SCHEMA = 1;

let state = load();
let prefs = loadPrefs();

function defaultState() {
  return { schema: SCHEMA, screen: 'setup', players: [], game: null, session: null };
}

function clampInt(v, lo, hi, fallback) {
  return Number.isInteger(v) && v >= lo && v <= hi ? v : fallback;
}

function sanitizeGame(g) {
  if (!g || !Array.isArray(g.players) || !g.players.length) return null;
  g.players.forEach((p) => {
    if (!p || typeof p.name !== 'string' || !p.card) return;
    CATEGORIES.forEach((k) => { if (!Number.isInteger(p.card[k])) p.card[k] = null; });
    if (!Number.isInteger(p.card.yahtzeeBonus)) p.card.yahtzeeBonus = 0;
  });
  const n = g.players.length;
  g.turnIndex = clampInt(g.turnIndex, 0, n - 1, 0);
  g.startIndex = clampInt(g.startIndex, 0, n - 1, 0);
  g.turnNumber = clampInt(g.turnNumber, 0, 13 * n, 0);
  g.rollsLeft = clampInt(g.rollsLeft, 0, 3, 3);
  g.rolledCount = clampInt(g.rolledCount, 0, 3, 0);
  g.dice = Array.isArray(g.dice) && g.dice.length === 5 ? g.dice.map((v) => clampInt(v, 0, 6, 0)) : [0, 0, 0, 0, 0];
  g.held = Array.isArray(g.held) && g.held.length === 5 ? g.held.map(Boolean) : [false, false, false, false, false];
  g.entry = Array.isArray(g.entry) && g.entry.length === 5 ? g.entry.map((v) => clampInt(v, 0, 6, 0)) : emptyEntry();
  g.finished = !!g.finished;
  if (g.lastRecord && typeof g.lastRecord === 'object') {
    const prev = g.lastRecord.prev;
    if (!prev || typeof prev !== 'object') {
      // a snapshot from an older build: undo still works, it just clears the turn
      g.lastRecord.prev = null;
    } else {
      prev.dice = Array.isArray(prev.dice) && prev.dice.length === 5 ? prev.dice.map((v) => clampInt(v, 0, 6, 0)) : [0, 0, 0, 0, 0];
      prev.held = Array.isArray(prev.held) && prev.held.length === 5 ? prev.held.map(Boolean) : [false, false, false, false, false];
      prev.entry = Array.isArray(prev.entry) && prev.entry.length === 5 ? prev.entry.map((v) => clampInt(v, 0, 6, 0)) : emptyEntry();
      prev.rollsLeft = clampInt(prev.rollsLeft, 0, 3, 0);
      prev.rolledCount = clampInt(prev.rolledCount, 0, 3, 0);
    }
  } else {
    g.lastRecord = null;
  }
  return g;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    if (!s || s.schema !== SCHEMA || !Array.isArray(s.players)) return defaultState();
    s.players = s.players.filter((n) => typeof n === 'string').slice(0, MAX_PLAYERS);
    s.game = sanitizeGame(s.game);
    s.session = s.session && Array.isArray(s.session.players) ? s.session : null;
    if (s.screen !== 'game' && s.screen !== 'over' && s.screen !== 'setup') s.screen = 'setup';
    return s;
  } catch {
    return defaultState();
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

const THEME_STORE = 'yahtzee.theme.v1';

function loadPrefs() {
  let theme = 'auto';
  try {
    const t = localStorage.getItem(THEME_STORE);
    if (t === 'light' || t === 'dark') theme = t;
  } catch { /* ignore */ }
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return {
      motion: p.motion !== false,
      haptics: p.haptics === true,
      // a first-ever visit rolls on the phone, so existing behaviour is the default
      dice: p.dice === 'table' ? 'table' : 'phone',
      theme: theme === 'auto' ? (p.theme || 'auto') : theme,
    };
  } catch { return { motion: true, haptics: false, dice: 'phone', theme }; }
}
function savePrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ motion: prefs.motion, haptics: prefs.haptics, dice: prefs.dice }));
    if (prefs.theme === 'light' || prefs.theme === 'dark') localStorage.setItem(THEME_STORE, prefs.theme);
    else localStorage.removeItem(THEME_STORE);
  } catch { /* ignore */ }
}

const tableMode = () => prefs.dice === 'table';

/* ────────────────────────── dice values (test hook first) ────────────────────────── */
function nextDieValue() {
  const queue = window.__yahtzeeDice;
  if (Array.isArray(queue) && queue.length) {
    const v = Number(queue.shift());
    if (Number.isFinite(v) && v >= 1 && v <= 6) return Math.round(v);
  }
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % 6) + 1;
}

/* ────────────────────────── dom helpers ────────────────────────── */
const $ = (id) => document.getElementById(id);
function el(tag, cls, testid) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (testid) n.setAttribute('data-testid', testid);
  return n;
}
function svgIcon(markup, size) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  n.setAttribute('viewBox', '0 0 24 24');
  n.setAttribute('width', size || 20);
  n.setAttribute('height', size || 20);
  n.setAttribute('aria-hidden', 'true');
  n.setAttribute('focusable', 'false');
  n.innerHTML = markup;
  return n;
}
const X_ICO = '<path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/>';
const announce = (msg) => { $('live').textContent = msg; };
function restart(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  if (prefs.motion) node.classList.add(cls);
}
const hasGame = () => !!(state.game && Array.isArray(state.game.players) && state.game.players.length);

/* ────────────────────────── dice ────────────────────────── */
const PIPS = {
  1: ['c'], 2: ['tl', 'br'], 3: ['tl', 'c', 'br'], 4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'c', 'bl', 'br'], 6: ['tl', 'tm', 'tr', 'bl', 'bm', 'br'],
};
const COORDS = { tl: [22, 22], tm: [22, 50], tr: [22, 78], c: [50, 50], bl: [78, 22], bm: [78, 50], br: [78, 78] };

function pipsInto(host, f, half) {
  for (const key of PIPS[f]) {
    const pip = el('span', 'pip');
    const [y, x] = COORDS[key];
    pip.style.top = `calc(${y}% - ${half}px)`;
    pip.style.left = `calc(${x}% - ${half}px)`;
    host.appendChild(pip);
  }
}

/** The six pip layouts of a physical die; CSS reveals the one matching data-value. */
function facesInto(host, half) {
  for (let f = 1; f <= 6; f++) {
    const face = el('span', 'face');
    face.dataset.face = String(f);
    pipsInto(face, f, half);
    host.appendChild(face);
  }
}

function buildDie(i) {
  const b = el('button', 'die', 'die');
  b.type = 'button';
  b.dataset.index = String(i);
  b.setAttribute('aria-pressed', 'false');
  facesInto(b, 5);
  b.addEventListener('click', () => onDieTap(i));
  return b;
}

/* ────────────────────────── scorecard ────────────────────────── */
const LABEL = {
  ones: 'Ones', twos: 'Twos', threes: 'Threes', fours: 'Fours', fives: 'Fives', sixes: 'Sixes',
  'three-kind': '3 of a kind', 'four-kind': '4 of a kind', 'full-house': 'Full house',
  'small-straight': 'Small straight', 'large-straight': 'Large straight', yahtzee: 'Yahtzee', chance: 'Chance',
};
const scoreEls = {};

function buildCard() {
  const card = $('card');
  card.textContent = '';
  [['upper', UPPER], ['lower', CATEGORIES.slice(6)]].forEach(([side, keys]) => {
    const col = el('div', `card-col card-col-${side}`);
    const head = el('p', 'card-section');
    head.textContent = side === 'upper' ? 'Upper section' : 'Lower section';
    col.appendChild(head);
    keys.forEach((key) => {
      const b = boxEl(key);
      col.appendChild(b);
      scoreEls[key] = b;
    });
    card.appendChild(col);
  });
}

function boxEl(key) {
  const b = el('button', 'box', `score-${key}`);
  b.type = 'button';
  b.dataset.state = 'open';
  b.disabled = true;
  const name = el('span', 'box-name');
  name.textContent = LABEL[key];
  const holder = el('span', 'box-score');
  const val = el('span', 'score-value', 'score-value');
  val.textContent = '–';
  holder.appendChild(val);
  b.append(name, holder);
  b.addEventListener('click', () => onScoreTap(key));
  return b;
}

/* ────────────────────────── setup ────────────────────────── */
function renderSetup() {
  const list = $('chips');
  list.textContent = '';
  if (!state.players.length) {
    const empty = el('li', 'chips-empty');
    empty.textContent = 'Nobody at the table yet. Add one player, or up to eight.';
    list.appendChild(empty);
  }
  state.players.forEach((name, i) => {
    const li = el('li', 'chip', 'player-chip');
    const seat = el('span', 'chip-seat');
    seat.textContent = String(i + 1);
    const nm = el('span', 'chip-name');
    nm.textContent = name;
    const rm = el('button', 'chip-remove', 'remove-player');
    rm.type = 'button';
    rm.setAttribute('aria-label', `Remove ${name}`);
    rm.appendChild(svgIcon(X_ICO, 20));
    rm.addEventListener('click', () => {
      state.players = state.players.filter((_, j) => j !== i);
      state.session = null;
      save();
      renderSetup();
    });
    li.append(seat, nm, rm);
    list.appendChild(li);
  });

  const full = state.players.length >= MAX_PLAYERS;
  $('add-player').disabled = full;
  $('start-game').disabled = state.players.length === 0;
  $('field-note').textContent = full
    ? 'Table is full at 8. Remove someone to swap a seat.'
    : 'Up to 8 players — they take turns in the order you add them.';

  const evening = $('evening');
  const tally = state.session && sameRoster(state.session, state.players) ? state.session : null;
  evening.hidden = !tally;
  if (tally) {
    const rows = $('evening-rows');
    rows.textContent = '';
    tally.players.forEach((r) => {
      const p = el('p');
      const nm = el('b');
      nm.textContent = r.name;
      const rest = el('span');
      rest.textContent = ` — ${r.wins} win${r.wins === 1 ? '' : 's'} · ${r.points} points`;
      p.append(nm, rest);
      rows.appendChild(p);
    });
    const note = el('p');
    note.textContent = `${tally.gamesPlayed} game${tally.gamesPlayed === 1 ? '' : 's'} so far. Removing or adding a player starts a fresh evening.`;
    note.style.marginTop = '8px';
    rows.appendChild(note);
  }
  $('start-game-label').textContent = state.players.length > 1
    ? `Start game — ${state.players[nextStartIndex()] ?? state.players[0]} first`
    : 'Start game';
}

function nextStartIndex() {
  return state.session && sameRoster(state.session, state.players) ? state.session.nextStart : 0;
}
function sameRoster(session, names) {
  return !!session && Array.isArray(session.players) && session.players.length === names.length
    && session.players.every((r, i) => r.name === names[i]);
}

function addPlayerFromInput() {
  const input = $('player-name');
  const name = input.value.trim();
  const note = $('field-note');
  if (!name) {
    note.textContent = 'Type a name first.';
    input.focus();
    return;
  }
  if (state.players.length >= MAX_PLAYERS) {
    note.textContent = 'A table holds eight players.';
    return;
  }
  if (document.activeElement === input) input.blur();
  if (state.players.some((p) => p.toLowerCase() === name.toLowerCase())) {
    note.textContent = `“${name}” is already at the table.`;
    input.select();
    return;
  }
  state.players = [...state.players, name];
  state.session = null;
  input.value = '';
  save();
  renderSetup();
  input.focus();
}

/* ────────────────────────── game ────────────────────────── */
let diceEl = null;

/** Which half of the felt tray is live: on-screen dice, or the real-dice keypad. */
function setTrayMode(table) {
  $('dice').hidden = table;
  $('roll-row').hidden = table;
  $('slots').hidden = !table;
  $('keypad').hidden = !table;
  if (table) {
    $('dice').setAttribute('inert', '');
    $('roll-row').setAttribute('inert', '');
  } else {
    $('dice').removeAttribute('inert');
    $('roll-row').removeAttribute('inert');
  }
}

function renderGame(tumbled) {
  const g = state.game;
  const table = tableMode();
  const player = currentPlayer(g);
  const card = player.card;
  const rolled = g.rolledCount > 0;
  const dice = g.dice.slice();
  const allowed = rolled ? allowedBoxes(card, dice) : [];
  const best = rolled ? bestOption(card, dice, allowed) : null;

  $('round').textContent = `Round ${roundOf(g)} of ${ROUNDS}`;
  const pips = $('round-pips');
  if (pips.childElementCount !== ROUNDS) {
    pips.textContent = '';
    for (let i = 0; i < ROUNDS; i++) pips.appendChild(el('i'));
  }
  const thisRound = roundOf(g);
  [...pips.children].forEach((pip, i) => {
    pip.className = i + 1 < thisRound ? 'done' : i + 1 === thisRound ? 'now' : '';
  });
  $('current-player').textContent = player.name;
  $('card-title').textContent = `${player.name}’s scorecard`;
  $('turn-hint').textContent = table
    ? (!rolled ? 'Real dice: tap the five faces you got.'
      : (entryComplete(g) ? 'Tap the box you want — one tap locks it in.'
        : 'Get all five faces in, then tap a box.'))
    : rolled
      ? (g.rollsLeft > 0 ? 'Tap a box to lock it in, or roll again.' : 'Last roll — pick a box to pass the phone.')
      : 'Tap Roll. Tap a die to hold it.';

  setTrayMode(table);

  if (table) {
    renderEntry(g);
  } else {
    $('rolls-left').textContent = String(g.rollsLeft);
    $('roll').disabled = g.finished || g.rollsLeft <= 0;
    $('roll-label').textContent = rolled
      ? (g.rollsLeft === 2 ? 'Roll the rest' : `Roll again · ${g.rollsLeft} left`)
      : 'Roll all five';

    diceEl.dataset.armed = rolled ? 'true' : 'false';
    const faces = rolled ? g.dice : [0, 0, 0, 0, 0];
    for (let i = 0; i < 5; i++) {
      const d = diceEl.children[i];
      const v = faces[i];
      if (v > 0) d.setAttribute('data-value', String(v));
      else d.removeAttribute('data-value');
      d.setAttribute('aria-pressed', g.held[i] ? 'true' : 'false');
      d.setAttribute('aria-label', rolled
        ? `Die ${i + 1} showing ${v}${g.held[i] ? ', held' : ''}. Tap to ${g.held[i] ? 'release' : 'hold'}.`
        : `Die ${i + 1}, not rolled yet`);
      if (tumbled && tumbled.has(i)) restart(d, 'tumble');
    }
  }

  for (const key of CATEGORIES) {
    const box = scoreEls[key];
    const filled = card[key] != null;
    const pickable = !filled && rolled && allowed.includes(key);
    box.dataset.state = filled ? 'recorded' : 'open';
    box.disabled = !pickable;
    box.querySelector('[data-testid="score-value"]').textContent = filled
      ? String(card[key])
      : rolled ? String(potential(card, key, dice)) : '–';
    box.classList.remove('last');
    box.classList.toggle('pickable', pickable);
    box.classList.toggle('pickable-best', pickable && key === best);
    box.classList.toggle('pickable-zero', pickable && potential(card, key, dice) === 0);
    box.setAttribute('aria-label', filled
      ? `${LABEL[key]}: scored ${card[key]}`
      : rolled
        ? `${LABEL[key]}: would score ${potential(card, key, dice)}${pickable ? ', tap to record' : ', not allowed on this roll'}`
        : `${LABEL[key]}: open, roll first`);
  }

  $('upper-subtotal').textContent = String(upperSubtotal(card));
  $('upper-bonus').textContent = String(upperBonus(card));
  $('yahtzee-bonus').textContent = String(card.yahtzeeBonus || 0);
  $('total').textContent = String(grandTotal(card));
  const undoBtn = $('undo');
  // Recording always hands the turn over, so this button is nearly always seen by the
  // *next* player while it still reverts the previous player's box. Say whose it is.
  // A mis-tapped box stays undoable until whoever's turn it became has touched
  // the turn (rolled a die or entered a face) — real dice at the table means the
  // mistake is usually spotted a few seconds late.
  const undoable = !!g.lastRecord && !g.finished && !turnTouched(g);
  undoBtn.classList.toggle('invisible', !undoable);
  $('card-head').classList.toggle('has-undo', undoable);
  undoBtn.setAttribute('aria-disabled', undoable ? 'false' : 'true');
  if (undoable) {
    const rec = g.lastRecord;
    const who = g.players[rec.playerIndex].name;
    // say the whole thing out loud: a bare "Undo Eduard's" makes people hunt for
    // which box they are about to lose.
    const whose = who === player.name ? 'your' : `${who}’s`;
    const txt = $('undo-txt');
    txt.style.fontSize = '';
    txt.textContent = `Undo ${whose} ${LABEL[rec.cat]} (${rec.value})`;
    // a 16-character name on a 375px phone cannot say all of that at 15px, and an
    // ellipsis here is exactly the vagueness the label exists to remove.
    for (let size = 15; size > 11 && txt.scrollWidth > txt.clientWidth; size -= 0.5) {
      txt.style.fontSize = `${size}px`;
    }
    undoBtn.setAttribute('aria-label',
      who === player.name
        ? `Undo your ${LABEL[rec.cat]} (${rec.value})`
        : `Undo ${who}’s ${LABEL[rec.cat]} (${rec.value}) — it is ${player.name}’s turn now`);
    if (rec.playerIndex === g.turnIndex) scoreEls[rec.cat].classList.add('last');
  }

  renderBoard();
}

/** Highlights the most appealing open box — a hint only, the player decides. */
function bestOption(card, dice, allowed) {
  let best = null;
  let bestRank = 2;
  for (const key of allowed) {
    const value = potential(card, key, dice);
    const rank = { great: 4, good: 3, fair: 2, zero: 0 }[potentialRating(key, value, dice, card)] ?? 1;
    if (rank > bestRank) { best = key; bestRank = rank; }
    else if (rank === bestRank && best && value > potential(card, best, dice)) best = key;
  }
  return bestRank >= 3 ? best : null;
}

function renderBoard() {
  const g = state.game;
  const board = $('scoreboard');
  const tally = state.session && sameRoster(state.session, g.players.map((p) => p.name)) ? state.session : null;
  if (tally) {
    const top = tally.players.reduce((a, b) => (b.points > a.points ? b : a), tally.players[0]);
    $('board-note').textContent = `Tonight · ${tally.gamesPlayed} game${tally.gamesPlayed === 1 ? '' : 's'} · `
      + `${top.name} ${top.points} pts, ${top.wins} win${top.wins === 1 ? '' : 's'}`;
  } else {
    $('board-note').textContent = 'Set the phone down — totals stay up.';
  }
  board.textContent = '';
  const totals = g.players.map((p) => grandTotal(p.card));
  const top = Math.max(...totals);
  g.players.forEach((p, i) => {
    const li = el('li', 'board-row', 'scoreboard-row');
    if (i === g.turnIndex) li.setAttribute('aria-current', 'true');
    if (top > 0 && totals[i] === top) li.classList.add('leading');
    const seat = el('span', 'board-seat');
    seat.textContent = String(i + 1);
    const nm = el('span', 'board-name', 'scoreboard-name');
    nm.textContent = p.name;
    const tot = el('span', 'board-total', 'scoreboard-total');
    tot.textContent = String(totals[i]);
    li.append(seat, nm, tot);
    board.appendChild(li);
  });
}

/* ────────────────────────── actions ────────────────────────── */
function onDieTap(i) {
  const g = state.game;
  if (!g || g.finished || tableMode()) return;
  if (!toggleHold(g, i)) return;
  save();
  buzz(8);
  renderGame();
}

function onRoll() {
  const g = state.game;
  if (!g || g.finished || tableMode() || g.rollsLeft <= 0) return;
  const changed = new Set();
  for (let i = 0; i < 5; i++) if (!g.held[i]) changed.add(i);
  if (!rollDice(g, nextDieValue)) return;
  save();
  renderGame(changed);
  const yah = isYahtzee(g.dice) && currentPlayer(g).card.yahtzee == null;
  announce(`Rolled ${g.dice.join(', ')}. ${g.rollsLeft} rolls left.`);
  if (yah) setTimeout(() => yahtzeeMoment(false), 240);
  else buzz([10, 26, 12]);
}

function onScoreTap(key) {
  const g = state.game;
  if (!g || g.finished) return;
  if (!record(g, key)) return;
  const rec = g.lastRecord;
  resetEntryFocus(g);
  save();
  buzz(rec.value > 0 ? [12, 40, 16] : 18);
  restart(scoreEls[key], 'just');
  setTimeout(() => scoreEls[key].classList.remove('just'), 700);

  if (g.finished) {
    if (rec.bonus > 0) yahtzeeMoment(true);
    finishGame();
    return;
  }
  renderGame();
  const next = currentPlayer(g).name;
  showHandover(`${LABEL[key]} ${rec.value} — pass to ${next}`);
  restart($('turn-banner'), 'passed');
  announce(`${LABEL[key]} recorded, ${rec.value}. ${next} to play.`);
  if (rec.bonus > 0) setTimeout(() => yahtzeeMoment(true), 140);
}

function onUndo() {
  const g = state.game;
  if (!g || g.finished || !g.lastRecord || turnTouched(g)) return;
  if (!undo(g)) return;
  save();
  renderGame();
  announce('Score undone.');
}

/** Cover the dice row the next player no longer needs, measured from its own box so
 *  the note can never spill onto the roll button, the keypad or a score box. */
function positionHandover(b) {
  const band = tableMode() && !$('slots').hidden ? $('slots') : $('dice');
  b.style.top = `${band.offsetTop}px`;
  b.style.height = `${band.offsetHeight}px`;
  b.style.left = `${band.offsetLeft}px`;
  b.style.width = `${band.offsetWidth}px`;
}

function showHandover(text) {
  const b = $('handover');
  b.textContent = text;
  b.classList.remove('show');
  positionHandover(b);
  void b.offsetWidth;
  if (prefs.motion) b.classList.add('show');
  clearTimeout(showHandover.timer);
  showHandover.timer = setTimeout(hideHandover, prefs.motion ? 1500 : 2200);
}

/** A "pass the phone" toast is about a turn that no longer exists once the game
 *  ends, and `animation ... both` would otherwise leave it parked over the reveal. */
function hideHandover() {
  const b = $('handover');
  b.classList.remove('show');
  b.textContent = '';
}

function yahtzeeMoment(isBonus) {
  const flash = $('yah-flash');
  $('yah-word').textContent = 'Yahtzee!';
  $('yah-sub').textContent = isBonus ? '+100 bonus' : 'Five of a kind';
  flash.hidden = false;
  flash.style.animation = 'none';
  void flash.offsetWidth;
  flash.style.animation = '';
  clearTimeout(yahtzeeMoment.timer);
  yahtzeeMoment.timer = setTimeout(() => {
    flash.hidden = true;
    $('yah-word').textContent = '';
    $('yah-sub').textContent = '';
  }, 1150);
  const host = tableMode() ? $('slots') : diceEl;
  for (const d of host.children) restart(d, 'yah-pop');
  confettiBits(host, 20);
  restart($('turn-banner'), 'passed');
  buzz([18, 60, 18, 60, 34]);
  announce(isBonus ? 'Yahtzee bonus — 100 points!' : 'Yahtzee!');
}

function confettiBits(host, count) {
  if (!prefs.motion) return;
  let wrap = host.querySelector('.confetti');
  if (!wrap) {
    wrap = el('div', 'confetti');
    host.appendChild(wrap);
  }
  wrap.textContent = '';
  const colors = ['#f6d98b', '#ff8a4c', '#6fe3a3', '#fffdf6'];
  for (let i = 0; i < count; i++) {
    const bit = el('i');
    bit.style.left = `${(i * (100 / count)) % 100}%`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDuration = `${0.75 + (i % 5) * 0.12}s`;
    bit.style.animationDelay = `${(i % 7) * 0.03}s`;
    wrap.appendChild(bit);
  }
  setTimeout(() => { wrap.textContent = ''; }, 1900);
}

/* ────────────────────────── game over ────────────────────────── */
function finishGame() {
  state.session = state.session && sameRoster(state.session, state.game.players.map((p) => p.name))
    ? mergeSession(state.session, state.game)
    : sessionFromGame(state.game);
  save();
  hideHandover();
  renderOver(true);
  setScreen('over');
}

function renderOver(reveal) {
  const g = state.game;
  const names = winners(g);
  const win = $('win');
  $('winner').textContent = names.join(' & ');
  $('win-kicker').textContent = names.length > 1 ? 'Tied — every one of you wins' : 'Winner';
  restart(win, 'reveal');
  if (reveal) confettiBits(win, 26);
  buzz([14, 50, 22, 60, 40]);

  win.querySelector('.win-sub')?.remove();
  const sub = el('p', 'win-sub');
  sub.textContent = `Game ${state.session.gamesPlayed} · ${g.players.length} player${g.players.length === 1 ? '' : 's'} · 13 rounds`;
  $('winner').after(sub);

  const final = $('final');
  final.textContent = '';
  standings(g).forEach((row, i) => {
    const card = g.players[row.index].card;
    const lower = CATEGORIES.slice(6).reduce((a, k) => a + (card[k] ?? 0), 0);
    const li = el('li', 'final-row', 'final-row');
    if (i === 0) li.classList.add('first');
    const rank = el('span', 'final-rank');
    rank.textContent = String(i + 1);
    const who = el('span', 'final-who');
    const nm = el('span', 'final-name', 'final-name');
    nm.textContent = row.name;
    const meta = el('span', 'final-meta');
    meta.textContent = `${upperSubtotal(card)} upper${upperBonus(card) ? ' + 35 bonus' : ''} · ${lower} lower`
      + (card.yahtzeeBonus ? ` · +${card.yahtzeeBonus} Yahtzee bonus` : '');
    who.append(nm, meta);
    const tot = el('span', 'final-total', 'final-total');
    tot.textContent = String(row.total);
    li.append(rank, who, tot);
    final.appendChild(li);
  });

  const s = state.session;
  $('games-played').textContent = String(s.gamesPlayed);
  const session = $('session');
  session.textContent = '';
  s.players.forEach((row) => {
    const li = el('li', 'session-row', 'session-row');
    const nm = el('span', 'session-name', 'session-name');
    nm.textContent = row.name;
    const wins = el('span', 'session-cell');
    const wl = el('span');
    wl.textContent = 'Wins';
    const wv = el('b', null, 'session-wins');
    wv.textContent = String(row.wins);
    wins.append(wl, wv);
    const pts = el('span', 'session-cell');
    const pl = el('span');
    pl.textContent = 'Points';
    const pv = el('b', null, 'session-points');
    pv.textContent = String(row.points);
    pts.append(pl, pv);
    li.append(nm, wins, pts);
    session.appendChild(li);
  });

  const nextStarter = g.players[(g.startIndex + 1) % g.players.length];
  $('play-again-label').textContent = `Play game ${s.gamesPlayed + 1}`;
  $('play-again-note').textContent = `${nextStarter.name} starts`;
}

/* ────────────────────────── screens ────────────────────────── */
function setScreen(name) {
  state.screen = name;
  save();
  $('screen-setup').hidden = name !== 'setup';
  $('screen-game').hidden = name !== 'game';
  $('screen-over').hidden = name !== 'over';
}

function beginGame(startIndex) {
  state.game = newGame(state.players, startIndex);
  setScreen('game');
  save();
  resetEntryFocus(state.game);
  renderGame();
  const name = currentPlayer(state.game).name;
  showHandover(`${name} starts — good luck`);
  announce(`Game on. ${name} goes first.`);
  requestWakeLock();
}

function startGame() {
  if (!state.players.length) return;
  if (state.session && !sameRoster(state.session, state.players)) state.session = null;
  beginGame(nextStartIndex());
}

function playAgain() {
  if (!hasGame() || !state.session) return;
  state.players = state.game.players.map((p) => p.name);
  beginGame(state.session.nextStart);
}

function changePlayers() {
  // Back to the roster; the evening tally survives until the player list actually changes.
  state.game = null;
  setScreen('setup');
  save();
  renderSetup();
}

/* ────────────────────────── theme / wake lock / haptics ────────────────────────── */
function resolvedTheme() {
  if (prefs.theme === 'light' || prefs.theme === 'dark') return prefs.theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme() {
  const t = resolvedTheme();
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.classList.toggle('no-motion', !prefs.motion);
  $('theme-label-setup').textContent = t === 'dark' ? 'Light mode' : 'Dark mode';
  $('theme-label-game').textContent = t === 'dark' ? 'Light' : 'Dark';
  const meta = $('theme-color');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#141009' : '#f5ecdb');
}
function toggleTheme() {
  prefs.theme = resolvedTheme() === 'dark' ? 'light' : 'dark';
  savePrefs();
  applyTheme();
}
function toggleHaptics() {
  prefs.haptics = !prefs.haptics;
  savePrefs();
  $('haptics-label').textContent = prefs.haptics ? 'Haptics on' : 'Haptics off';
  buzz(20);
}
function toggleMotion() {
  prefs.motion = !prefs.motion;
  savePrefs();
  $('motion-label').textContent = prefs.motion ? 'Animations on' : 'Animations off';
  applyTheme();
}

let wakeLock = null;
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    await wakeLock?.release?.().catch(() => {});
    wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* not available */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.screen === 'game') requestWakeLock();
});

function buzz(pattern) {
  if (!prefs.haptics) return;
  try { navigator.vibrate?.(pattern); } catch { /* no haptics */ }
}

/* ────────────────────────── how-to sheet ────────────────────────── */
let lastFocused = null;
function openSheet() {
  lastFocused = document.activeElement;
  $('how-sheet').hidden = false;
  $('how-close').focus();
}
function closeSheet() {
  $('how-sheet').hidden = true;
  lastFocused?.focus?.();
}

/* ────────────────────────── the table (glance standings) ────────────────────────── */
function renderTableSheet() {
  const g = state.game;
  if (!g) return;
  $('table-sub').textContent = g.finished
    ? `Game over · ${g.players.length} player${g.players.length === 1 ? '' : 's'} · 13 rounds`
    : `Round ${roundOf(g)} of ${ROUNDS} · ${currentPlayer(g).name} to play`;

  const rows = $('table-rows');
  rows.textContent = '';
  standings(g).forEach((row, i) => {
    const card = g.players[row.index].card;
    const lower = CATEGORIES.slice(6).reduce((a, k) => a + (card[k] ?? 0), 0);
    const li = el('li', 'sheet-row');
    if (i === 0 && row.total > 0) li.classList.add('lead');
    if (!g.finished && row.index === g.turnIndex) li.classList.add('playing');
    const rank = el('span', 'sheet-rank');
    rank.textContent = String(i + 1);
    const who = el('span', 'sheet-who');
    const nm = el('span', 'sheet-name');
    nm.textContent = row.name;
    const meta = el('span', 'sheet-meta');
    meta.textContent = `${upperSubtotal(card)} upper${upperBonus(card) ? ' + 35' : ''} · ${lower} lower`
      + (card.yahtzeeBonus ? ` · +${card.yahtzeeBonus} Yahtzee` : '');
    who.append(nm, meta);
    const total = el('span', 'sheet-total');
    total.textContent = String(row.total);
    li.append(rank, who, total);
    rows.appendChild(li);
  });

  const session = state.session;
  $('table-session').hidden = !session || session.gamesPlayed < 1;
  if (session && session.gamesPlayed >= 1) {
    $('table-games').textContent = String(session.gamesPlayed);
    const list = $('table-session-rows');
    list.textContent = '';
    session.players.forEach((r) => {
      const li = el('li', 'session-row');
      const nm = el('span', 'session-name');
      nm.textContent = r.name;
      const wins = el('span', 'session-cell');
      const wlab = el('span');
      wlab.textContent = 'Wins';
      const wnum = el('b');
      wnum.textContent = String(r.wins);
      wins.append(wlab, wnum);
      const pts = el('span', 'session-cell');
      const plab = el('span');
      plab.textContent = 'Points';
      const pnum = el('b');
      pnum.textContent = String(r.points);
      pts.append(plab, pnum);
      li.append(nm, wins, pts);
      list.appendChild(li);
    });
  }
}

function openTableSheet() {
  lastFocused = document.activeElement;
  renderTableSheet();
  $('table-sheet').hidden = false;
  $('table-close').focus();
}
function closeTableSheet() {
  $('table-sheet').hidden = true;
  lastFocused?.focus?.();
}

/* ────────────────────────── real dice at the table ────────────────────────── */
const slotEls = [];
const keyEls = [];
let pendingSlot = -1;

const firstEmptySlot = (g) => g.entry.findIndex((v) => !(v >= 1 && v <= 6));
const lastFilledSlot = (g) => {
  for (let i = g.entry.length - 1; i >= 0; i--) if (g.entry[i] >= 1) return i;
  return -1;
};
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth'];

function buildEntry() {
  const slots = $('slots');
  slots.textContent = '';
  for (let i = 0; i < ENTRY_LEN; i++) {
    const b = el('button', 'slot', 'entry-slot');
    b.type = 'button';
    b.dataset.index = String(i);
    b.dataset.filled = 'false';
    const n = el('span', 'slot-n');
    n.textContent = String(i + 1);
    b.appendChild(n);
    const face = el('span', 'die');
    face.setAttribute('aria-hidden', 'true');
    facesInto(face, 5);
    b.appendChild(face);
    b.addEventListener('click', () => onSlotTap(i));
    slots.appendChild(b);
    slotEls[i] = b;
  }
  const keys = $('keys');
  keys.textContent = '';
  for (let f = 1; f <= 6; f++) {
    const b = el('button', 'key', 'entry-key');
    b.type = 'button';
    b.dataset.face = String(f);
    // face on top, its number and count in a strip UNDER it: nothing may ever sit
    // on a pip, or the key stops being a faithful picture of the die on the table.
    const face = el('span', 'kface');
    face.setAttribute('aria-hidden', 'true');
    pipsInto(face, f, 4);
    b.appendChild(face);
    const label = el('span', 'klabel');
    label.setAttribute('aria-hidden', 'true');
    const num = el('span', 'knum');
    num.textContent = String(f);
    const count = el('span', 'kcount');
    label.append(num, count);
    b.appendChild(label);
    b.addEventListener('click', () => onKeyTap(f));
    keys.appendChild(b);
    keyEls[f] = b;
  }
}

function renderEntry(g, popSlot) {
  const entered = entryCount(g);
  const complete = entryComplete(g);
  const target = pendingSlot >= 0 ? pendingSlot : firstEmptySlot(g);
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const v of g.entry) counts[v] += 1;

  for (let i = 0; i < ENTRY_LEN; i++) {
    const b = slotEls[i];
    const face = g.entry[i];
    const filled = face >= 1;
    b.dataset.filled = filled ? 'true' : 'false';
    b.dataset.pending = pendingSlot === i ? 'true' : 'false';
    const die = b.lastElementChild;
    if (filled) die.setAttribute('data-value', String(face));
    else die.removeAttribute('data-value');
    b.setAttribute('aria-label', filled
      ? `Die ${i + 1} showing ${face}. Tap to change it, tap again to clear it.`
      : `Die ${i + 1}, empty. Tap to choose its value.`);
    if (popSlot === i && filled) restart(die, 'slot-set');
  }

  for (let f = 1; f <= 6; f++) {
    const b = keyEls[f];
    b.dataset.count = String(counts[f]);
    // 0 must show nothing at all: an always-on marker read as a pip and made the
    // 4/5/6 keys look like the wrong face.
    b.querySelector('.kcount').textContent = counts[f] ? `×${counts[f]}` : '';
    b.setAttribute('aria-label', `Enter a ${f}`
      + (counts[f] ? `, ${counts[f]} of these in already` : '')
      + (target >= 0 ? `, goes in die ${target + 1}` : ', all five dice are already in'));
  }

  const hint = $('entry-hint');
  hint.dataset.ready = complete ? 'true' : 'false';
  hint.textContent = complete
    ? 'All five in — tap a box to record. Tap a die above to fix a face.'
    : entered
      ? `${entered} of 5 in — ${pendingSlot >= 0 ? `die ${pendingSlot + 1} selected` : 'tap the next face'} · you can record once all five are in`
      : 'Roll at the table, then tap the five faces you got. Order does not matter.';
  $('entry-count').textContent = `${entered} of 5`;
  $('entry-count').dataset.ready = complete ? 'true' : 'false';
}

function onKeyTap(face) {
  const g = state.game;
  if (!g || g.finished || !tableMode()) return;
  const target = pendingSlot >= 0 ? pendingSlot : firstEmptySlot(g);
  if (target < 0) {
    announce('All five dice are already in. Tap one of them to change it.');
    restart($('entry-hint'), 'nudge');
    return;
  }
  setEntryFace(g, target, face);
  pendingSlot = -1;
  save();
  buzz(10);
  renderGame();
  renderEntry(g, target);
  const left = ENTRY_LEN - entryCount(g);
  announce(`${face} in die ${target + 1}. ${left ? `${left} to go.` : 'All five in — tap a box to record.'}`);
  if (!left) {
    restart($('slots'), 'ready');
    if (isYahtzee(g.dice) && currentPlayer(g).card.yahtzee == null) {
      setTimeout(() => yahtzeeMoment(false), 200);
    }
  }
}

function onSlotTap(i) {
  const g = state.game;
  if (!g || g.finished || !tableMode()) return;
  const filled = g.entry[i] >= 1;
  if (pendingSlot === i) {
    if (!filled) { pendingSlot = -1; }
    else {
      setEntryFace(g, i, 0);
      pendingSlot = -1;
      save();
      buzz(14);
      renderGame();
      renderEntry(g);
      announce(`Cleared die ${i + 1}. Tap a face to put a new one in.`);
      return;
    }
  } else {
    pendingSlot = i;
  }
  renderEntry(g);
  announce(filled
    ? `Die ${i + 1} selected, showing ${g.entry[i]}. Tap a face to replace it, or tap it again to clear.`
    : `Die ${ORDINAL[i]} selected. Tap the face you rolled.`);
}

function onEntryLast() {
  const g = state.game;
  if (!g || g.finished || !tableMode()) return;
  const i = lastFilledSlot(g);
  if (i < 0) {
    announce('No dice entered yet.');
    return;
  }
  pendingSlot = i;
  setEntryFace(g, i, 0);
  save();
  buzz(14);
  renderGame();
  renderEntry(g);
  announce(`Took die ${i + 1} back out. Enter it again if that was a mistake.`);
}

function onEntryClear() {
  const g = state.game;
  if (!g || g.finished || !tableMode()) return;
  if (entryCount(g) === 0) {
    announce('Nothing entered yet.');
    return;
  }
  clearEntry(g);
  pendingSlot = 0;
  save();
  buzz([10, 30, 10]);
  renderGame();
  renderEntry(g);
  announce('Dice cleared. Enter all five faces again.');
}

/** A new turn forgets the selection so the next tap fills die 1 again. */
const resetEntryFocus = (g) => { pendingSlot = entryComplete(g) ? -1 : Math.max(firstEmptySlot(g), 0); };

/* ────────────────────────── dice mode ────────────────────────── */
const DICE_NOTE = {
  phone: 'The phone rolls and tumbles five dice on screen.',
  table: 'Roll the real dice on the table, then tap the five faces you got. No rolling on screen.',
};

/** Carrying a half-played turn across a mode switch, without touching any score. */
function transferTurn(g, mode) {
  if (!g || g.finished) return;
  if (mode === 'table') {
    if (entryCount(g) === 0 && g.rolledCount > 0) {
      g.entry = g.dice.slice();
      syncEntry(g);
    }
  } else if (g.rolledCount === 0 && entryCount(g) > 0) {
    // faces typed but never all five: on the phone this turn is a roll instead
    clearEntry(g);
  }
  resetEntryFocus(g);
}

function setDiceMode(mode) {
  if (mode !== 'phone' && mode !== 'table') return;
  if (prefs.dice === mode) { closeDiceSheet(); return; }
  const before = hasGame() ? state.game.players.map((p) => JSON.stringify(p.card)).join('|') : '';
  prefs.dice = mode;
  savePrefs();
  if (hasGame()) transferTurn(state.game, mode);
  const after = hasGame() ? state.game.players.map((p) => JSON.stringify(p.card)).join('|') : '';
  if (before !== after) throw new Error('mode switch changed a scorecard');
  save();
  renderDiceMode();
  if (hasGame() && !state.game.finished) renderGame();
  announce(mode === 'table'
    ? 'Real dice at the table. Nobody’s scores changed.'
    : 'Dice on this phone. Nobody’s scores changed.');
}

function renderDiceMode() {
  const table = tableMode();
  document.documentElement.classList.toggle('mode-table', table);
  const pairs = [['dice-phone', false], ['dice-table', true], ['dice-sheet-phone', false], ['dice-sheet-table', true]];
  for (const [id, isTable] of pairs) {
    const b = $(id);
    b.setAttribute('aria-checked', String(table === isTable));
  }
  $('dice-mode-note').textContent = table ? DICE_NOTE.table : DICE_NOTE.phone;
  $('dice-sheet-note').textContent = table ? DICE_NOTE.table : DICE_NOTE.phone;
  const btn = $('dice-game');
  btn.setAttribute('aria-label', (table ? 'Dice are real dice at the table' : 'Dice come from this phone')
    + '. Change where the dice come from.');
  btn.dataset.mode = table ? 'table' : 'phone';
  $('dice-mode-inline').textContent = table ? 'Real dice' : 'On phone';
}

function openDiceSheet() {
  lastFocused = document.activeElement;
  renderDiceMode();
  $('dice-sheet').hidden = false;
  $('dice-sheet-close').focus();
}
function closeDiceSheet() {
  $('dice-sheet').hidden = true;
  lastFocused?.focus?.();
}

/* ────────────────────────── boot ────────────────────────── */
function boot() {
  diceEl = $('dice');
  for (let i = 0; i < 5; i++) diceEl.appendChild(buildDie(i));
  buildEntry();
  buildCard();

  $('add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    addPlayerFromInput();
  });
  $('start-game').addEventListener('click', startGame);
  // the hand-over note steps aside the moment the new player starts working
  $('screen-game').addEventListener('pointerdown', hideHandover);
  $('roll').addEventListener('click', onRoll);
  $('undo').addEventListener('click', onUndo);
  $('play-again').addEventListener('click', playAgain);
  $('change-players').addEventListener('click', changePlayers);
  $('how-setup').addEventListener('click', openSheet);
  $('how-game').addEventListener('click', openSheet);
  $('how-close').addEventListener('click', closeSheet);
  $('how-sheet').addEventListener('click', (e) => {
    if (e.target.dataset.close || e.target.classList.contains('sheet-backdrop')) closeSheet();
  });
  $('dice-phone').addEventListener('click', () => setDiceMode('phone'));
  $('dice-table').addEventListener('click', () => setDiceMode('table'));
  $('dice-game').addEventListener('click', openDiceSheet);
  $('dice-sheet-phone').addEventListener('click', () => setDiceMode('phone'));
  $('dice-sheet-table').addEventListener('click', () => setDiceMode('table'));
  $('dice-sheet-close').addEventListener('click', closeDiceSheet);
  $('dice-sheet').addEventListener('click', (e) => {
    if (e.target.dataset.close || e.target.classList.contains('sheet-backdrop')) closeDiceSheet();
  });
  $('entry-last').addEventListener('click', onEntryLast);
  $('entry-clear').addEventListener('click', onEntryClear);
  $('table-game').addEventListener('click', openTableSheet);
  $('table-close').addEventListener('click', closeTableSheet);
  $('table-sheet').addEventListener('click', (e) => {
    if (e.target.dataset.close || e.target.classList.contains('sheet-backdrop')) closeTableSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('dice-sheet').hidden) closeDiceSheet();
    else if (!$('table-sheet').hidden) closeTableSheet();
    else if (!$('how-sheet').hidden) closeSheet();
  });
  $('theme-setup').addEventListener('click', toggleTheme);
  $('theme-game').addEventListener('click', toggleTheme);
  $('haptics-setup').addEventListener('click', toggleHaptics);
  $('motion-setup').addEventListener('click', toggleMotion);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (prefs.theme === 'auto') applyTheme();
  });

  applyTheme();
  renderDiceMode();
  $('haptics-label').textContent = prefs.haptics ? 'Haptics on' : 'Haptics off';
  $('motion-label').textContent = prefs.motion ? 'Animations on' : 'Animations off';

  if (hasGame() && state.game.finished) {
    if (!state.session) finishGame();
    else { setScreen('over'); renderOver(false); }
  } else if (hasGame()) {
    setScreen('game');
    resetEntryFocus(state.game);
    renderGame();
  } else {
    state.game = null;
    state.screen = 'setup';
    setScreen('setup');
  }
  renderSetup();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

boot();
