/* Yahtzee rules engine — pure functions, no DOM, no globals. */

export const CATEGORIES = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'three-kind', 'four-kind', 'full-house', 'small-straight', 'large-straight', 'yahtzee', 'chance',
];
export const UPPER = CATEGORIES.slice(0, 6);
export const LOWER = CATEGORIES.slice(6);
export const ROUNDS = 13;
export const MAX_PLAYERS = 8;

const sum = (d) => d.reduce((a, b) => a + b, 0);

export function counts(dice) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const v of dice) if (v >= 1 && v <= 6) c[v] += 1;
  return c; // index 1..6
}

export function hasRun(dice, len) {
  const set = new Set(dice);
  for (let start = 1; start + len - 1 <= 6; start++) {
    let ok = true;
    for (let f = start; f < start + len; f++) if (!set.has(f)) ok = false;
    if (ok) return true;
  }
  return false;
}

/** Official box value for a roll (no Joker substitution). */
export function scoreFor(cat, dice) {
  const c = counts(dice);
  const up = UPPER.indexOf(cat);
  if (up >= 0) return c[up + 1] * (up + 1);
  switch (cat) {
    case 'three-kind': return c.some((n) => n >= 3) ? sum(dice) : 0;
    case 'four-kind': return c.some((n) => n >= 4) ? sum(dice) : 0;
    case 'full-house': return c.includes(3) && c.includes(2) ? 25 : 0;
    case 'small-straight': return hasRun(dice, 4) ? 30 : 0;
    case 'large-straight': return hasRun(dice, 5) ? 40 : 0;
    case 'yahtzee': return c.includes(5) ? 50 : 0;
    case 'chance': return sum(dice);
    default: return 0;
  }
}

export const isYahtzee = (dice) => counts(dice).includes(5);
export const yahtzeeNumber = (dice) => {
  const c = counts(dice);
  for (let f = 1; f <= 6; f++) if (c[f] === 5) return f;
  return 0;
};

export function upperSubtotal(card) {
  return UPPER.reduce((a, k) => a + (card[k] ?? 0), 0);
}
export const upperBonus = (card) => (upperSubtotal(card) >= 63 ? 35 : 0);
export function lowerSubtotal(card) {
  return LOWER.reduce((a, k) => a + (card[k] ?? 0), 0);
}
export function grandTotal(card) {
  return upperSubtotal(card) + upperBonus(card) + lowerSubtotal(card) + (card.yahtzeeBonus || 0);
}

/**
 * The official forced Joker: it is in force once the Yahtzee box is settled and
 * the dice still come up five of a kind. Returns null for a plain roll; otherwise
 * `allowed` lists the boxes the player may pick and `values` their score.
 */
export function jokerRule(card, dice) {
  if (card.yahtzee == null || !isYahtzee(dice)) return null;
  const n = yahtzeeNumber(dice);
  const upperKey = UPPER[n - 1];
  const s = sum(dice);
  if (card[upperKey] == null) {
    return { forcedUpper: true, allowed: [upperKey], values: { [upperKey]: s } };
  }
  const values = {};
  const allowed = [];
  for (const k of LOWER) {
    if (card[k] != null) continue;
    values[k] = ['full-house', 'small-straight', 'large-straight'].includes(k)
      ? { 'full-house': 25, 'small-straight': 30, 'large-straight': 40 }[k]
      : s;
    allowed.push(k);
  }
  if (allowed.length) return { forcedUpper: false, allowed, values };
  const zeros = {};
  const openUpper = UPPER.filter((k) => card[k] == null);
  for (const k of openUpper) zeros[k] = 0;
  return { forcedUpper: false, allowed: openUpper, values: zeros };
}

/** Boxes selectable for this roll, given the card. */
export function allowedBoxes(card, dice) {
  const joker = jokerRule(card, dice);
  if (joker) return joker.allowed;
  return CATEGORIES.filter((k) => card[k] == null);
}

/** What an open box would score for this roll (Joker substitutions applied). */
export function potential(card, cat, dice) {
  const joker = jokerRule(card, dice);
  if (joker && joker.allowed.includes(cat)) return joker.values[cat];
  return scoreFor(cat, dice);
}

export function bonusEarned(card, dice) {
  return card.yahtzee === 50 && isYahtzee(dice) ? 100 : 0;
}

export function emptyCard() {
  const card = { yahtzeeBonus: 0 };
  for (const k of CATEGORIES) card[k] = null;
  return card;
}

/* ───────────── real dice at the table: the phone only transcribes ───────────── */
export const ENTRY_LEN = 5;
export const emptyEntry = () => [0, 0, 0, 0, 0];
export const entryCount = (g) => g.entry.filter((v) => v >= 1 && v <= 6).length;
export const entryComplete = (g) => entryCount(g) === ENTRY_LEN;
/** Has this player started entering/rolling yet? Undo stops being offered then. */
export const turnTouched = (g) => g.rolledCount > 0 || entryCount(g) > 0;

/**
 * Put `face` into slot `i` (0 to clear). A real-dice turn is only "rolled" once all
 * five faces are in, which is what unlocks the scorecard; editing anything after that
 * locks it again. The engine is otherwise untouched, so scoring/Joker rules are shared.
 */
export function setEntryFace(g, i, face) {
  if (g.finished || i < 0 || i >= ENTRY_LEN) return false;
  if (face !== 0 && !(face >= 1 && face <= 6)) return false;
  g.entry[i] = face;
  syncEntry(g);
  return true;
}

export function clearEntry(g) {
  if (g.finished) return false;
  g.entry = emptyEntry();
  syncEntry(g);
  return true;
}

export function syncEntry(g) {
  if (entryComplete(g)) {
    g.dice = g.entry.slice();
    g.rolledCount = 1;
    g.rollsLeft = 0;
    g.held = [false, false, false, false, false];
  } else {
    g.dice = [0, 0, 0, 0, 0];
    g.rolledCount = 0;
    g.rollsLeft = 3;
    g.held = [false, false, false, false, false];
  }
}

/** A fresh turn wipes the real-dice entry too. */
function resetTurn(g) {
  g.turnNumber += 1;
  g.turnIndex = (g.startIndex + (g.turnNumber % g.players.length)) % g.players.length;
  g.rollsLeft = 3;
  g.dice = [0, 0, 0, 0, 0];
  g.rolledCount = 0;
  g.held = [false, false, false, false, false];
  g.entry = emptyEntry();
}

export function newGame(names, startIndex = 0) {
  return {
    kind: 'game',
    version: 1,
    players: names.map((name) => ({ name, card: emptyCard() })),
    startIndex: ((startIndex % names.length) + names.length) % names.length,
    turnIndex: ((startIndex % names.length) + names.length) % names.length,
    turnNumber: 0,
    rollsLeft: 3,
    dice: [0, 0, 0, 0, 0],
    rolledCount: 0,
    held: [false, false, false, false, false],
    entry: emptyEntry(),
    lastRecord: null,
    history: [],
    finished: false,
  };
}

export const currentPlayer = (g) => g.players[g.turnIndex];
export const diceShown = (g) => (g.rolledCount > 0 ? g.dice.map(String) : ['', '', '', '', '']);
export const roundOf = (g) => Math.min(ROUNDS, Math.floor(g.turnNumber / g.players.length) + 1);

export function rollDice(g, rng) {
  if (g.finished || g.rollsLeft <= 0) return false;
  for (let i = 0; i < 5; i++) {
    if (!g.held[i]) g.dice[i] = rng();
  }
  g.rollsLeft -= 1;
  g.rolledCount += 1;
  return true;
}

export function toggleHold(g, i) {
  if (g.finished || g.rolledCount === 0) return false;
  g.held[i] = !g.held[i];
  return true;
}

export function record(g, cat, dice = g.dice) {
  if (g.finished) return false;
  if (g.rolledCount === 0) return false;
  const card = currentPlayer(g).card;
  if (card[cat] != null) return false;
  if (!allowedBoxes(card, dice).includes(cat)) return false;
  const bonus = bonusEarned(card, dice);
  if (!Array.isArray(g.history)) g.history = g.lastRecord ? [g.lastRecord] : [];
  card[cat] = potential(card, cat, dice);
  card.yahtzeeBonus += bonus;
  g.lastRecord = {
    playerIndex: g.turnIndex,
    cat,
    value: card[cat],
    bonus,
    dice: dice.slice(),
    // the turn exactly as it was before this tap, so Undo can put it back
    prev: {
      dice: g.dice.slice(),
      held: g.held.slice(),
      rollsLeft: g.rollsLeft,
      rolledCount: g.rolledCount,
      entry: g.entry.slice(),
    },
    wasYahtzeeMoment: cat === 'yahtzee' && card[cat] === 50,
  };
  g.history.push(g.lastRecord);
  resetTurn(g);
  g.finished = g.players.every((p) => CATEGORIES.every((k) => p.card[k] != null));
  return true;
}

export function undo(g) {
  if (!g.lastRecord) return false;
  const { playerIndex, cat, value, bonus, prev } = g.lastRecord;
  const card = g.players[playerIndex].card;
  if (card[cat] !== value) return false;
  card[cat] = null;
  card.yahtzeeBonus -= bonus;
  g.turnNumber -= 1;
  g.turnIndex = playerIndex;
  // back to the turn exactly as it stood: same faces, holds and rolls left
  if (prev) {
    g.held = Array.isArray(prev.held) ? prev.held.slice() : [false, false, false, false, false];
    g.rollsLeft = Number.isInteger(prev.rollsLeft) ? prev.rollsLeft : 0;
    g.rolledCount = Number.isInteger(prev.rolledCount) ? prev.rolledCount : 0;
    g.entry = Array.isArray(prev.entry) ? prev.entry.slice() : emptyEntry();
    g.dice = g.rolledCount > 0 ? prev.dice.slice() : [0, 0, 0, 0, 0];
  } else {
    g.rollsLeft = 3;
    g.dice = [0, 0, 0, 0, 0];
    g.rolledCount = 0;
    g.held = [false, false, false, false, false];
    g.entry = emptyEntry();
  }
  if (Array.isArray(g.history)) g.history.pop();
  g.lastRecord = g.history?.at(-1) ?? null;
  g.finished = false;
  return true;
}

export function restartTurn(g) {
  if (g.finished) return false;
  g.dice = [0, 0, 0, 0, 0];
  g.held = [false, false, false, false, false];
  g.entry = emptyEntry();
  g.rolledCount = 0;
  g.rollsLeft = 3;
  return true;
}

export function emptySession(names) {
  return {
    gamesPlayed: 0,
    nextStart: 0,
    players: names.map((name) => ({ name, wins: 0, points: 0 })),
  };
}

export function sessionFromGame(game) {
  const s = emptySession(game.players.map((p) => p.name));
  s.gamesPlayed = 1;
  s.nextStart = (game.startIndex + 1) % game.players.length;
  const totals = game.players.map((p) => grandTotal(p.card));
  const best = Math.max(...totals);
  game.players.forEach((p, i) => {
    s.players[i].points += totals[i];
    if (totals[i] === best) s.players[i].wins += 1;
  });
  return s;
}

export function mergeSession(session, game) {
  const totals = game.players.map((p) => grandTotal(p.card));
  const best = Math.max(...totals);
  game.players.forEach((p, i) => {
    const row = session.players[i];
    row.points += totals[i];
    if (totals[i] === best) row.wins += 1;
  });
  session.gamesPlayed += 1;
  session.nextStart = (game.startIndex + 1) % game.players.length;
  return session;
}

/** Final standings: highest total first, ties keep seating order. */
export function standings(game) {
  return game.players
    .map((p, i) => ({ name: p.name, total: grandTotal(p.card), index: i }))
    .sort((a, b) => b.total - a.total || a.index - b.index);
}

export function winners(game) {
  const totals = game.players.map((p) => grandTotal(p.card));
  const best = Math.max(...totals);
  return game.players.filter((p) => grandTotal(p.card) === best).map((p) => p.name);
}

/** Heuristic rating for a potential score, used only to hint — never to decide. */
export function potentialRating(cat, value, dice, card) {
  if (card[cat] != null) return 'flat';
  if (value === 0) return 'zero';
  const upper = UPPER.includes(cat);
  if (upper) {
    const needed = (UPPER.indexOf(cat) + 1) * 3;
    if (value >= needed) return 'great';
    return value >= needed * 0.66 ? 'good' : 'fair';
  }
  if (cat === 'yahtzee') return value >= 50 ? 'great' : 'fair';
  if (cat === 'full-house') return value >= 25 ? 'great' : 'zero';
  if (cat === 'small-straight') return value >= 30 ? 'great' : 'zero';
  if (cat === 'large-straight') return value >= 40 ? 'great' : 'zero';
  if (cat === 'three-kind') return value >= 23 ? 'great' : value >= 16 ? 'good' : 'fair';
  if (cat === 'four-kind') return value >= 28 ? 'great' : value >= 20 ? 'good' : 'fair';
  if (cat === 'chance') return value >= 18 ? 'great' : value >= 13 ? 'good' : 'fair';
  return 'fair';
}
