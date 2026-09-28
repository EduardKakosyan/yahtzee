/**
 * Exhaustive cross-check of the engine against an independent oracle written
 * straight from the brief's rule table, over all 6^5 = 7776 rolls crossed with a
 * spread of scorecard states. The oracle is deliberately implemented differently
 * (sorted runs, no counts array) so a shared mistake is unlikely.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, UPPER, LOWER, scoreFor, allowedBoxes, potential, jokerRule, bonusEarned, emptyCard } from '../src/rules.js';

/* ───────────── independent oracle (from the brief, not from rules.js) ───────────── */
const ORACLE_KEYS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'three-kind', 'four-kind',
  'full-house', 'small-straight', 'large-straight', 'yahtzee', 'chance'];

function oracleScore(cat, dice) {
  const sorted = [...dice].sort((a, b) => a - b);
  const total = dice.reduce((a, b) => a + b, 0);
  // run-length pairs, e.g. [3,3,3,3,3] -> [[3,5]]
  const runs = [];
  for (const v of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[0] === v) last[1] += 1; else runs.push([v, 1]);
  }
  const sizes = runs.map((r) => r[1]).sort();
  const faces = runs.map((r) => r[0]);
  const ofAKind = (n) => runs.some((r) => r[1] >= n);

  if (/^ones|twos|threes|fours|fives|sixes$/.test(cat)) {
    const face = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 }[cat];
    return dice.filter((d) => d === face).length * face;
  }
  switch (cat) {
    case 'three-kind': return ofAKind(3) ? total : 0;
    case 'four-kind': return ofAKind(4) ? total : 0;
    // three of one number AND two of another: exactly the run pattern [3,2]
    case 'full-house': return sizes.length === 2 && sizes[0] === 2 && sizes[1] === 3 ? 25 : 0;
    case 'small-straight': {
      const uniq = [...new Set(dice)].sort((a, b) => a - b);
      for (let i = 0; i + 3 < uniq.length; i++) {
        if (uniq[i + 1] === uniq[i] + 1 && uniq[i + 2] === uniq[i] + 2 && uniq[i + 3] === uniq[i] + 3) return 30;
      }
      return 0;
    }
    case 'large-straight': return faces.length === 5 && Math.max(...faces) - Math.min(...faces) === 4 ? 40 : 0;
    case 'yahtzee': return runs.length === 1 ? 50 : 0;
    case 'chance': return total;
    default: throw new Error('unknown box ' + cat);
  }
}

const isFive = (dice) => dice.every((d) => d === dice[0]);
const faceOfFive = (dice) => dice[0];

/** Mirror of the brief's Joker prose. Returns null when the Joker is not in force. */
function oracleJoker(card, dice) {
  if (card.yahtzee === null || card.yahtzee === undefined || !isFive(dice)) return null;
  const total = dice.reduce((a, b) => a + b, 0);
  const upperKey = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'][faceOfFive(dice) - 1];
  if (card[upperKey] === null || card[upperKey] === undefined) {
    return { allowed: [upperKey], values: { [upperKey]: total } };
  }
  const jokerValue = { 'full-house': 25, 'small-straight': 30, 'large-straight': 40 };
  const allowed = LOWER.filter((k) => card[k] === null || card[k] === undefined);
  if (allowed.length) {
    const values = {};
    for (const k of allowed) values[k] = jokerValue[k] ?? total;
    return { allowed, values };
  }
  const openUpper = UPPER.filter((k) => card[k] === null || card[k] === undefined);
  const values = {};
  for (const k of openUpper) values[k] = 0;
  return { allowed: openUpper, values };
}

/* ───────────── card fixtures spanning the interesting states ───────────── */
function cardWith(filled) {
  const c = emptyCard();
  for (const [k, v] of Object.entries(filled)) c[k] = v;
  return c;
}

const CARDS = [
  ['blank', cardWith({})],
  ['yahtzee=50', cardWith({ yahtzee: 50 })],
  ['yahtzee=0', cardWith({ yahtzee: 0 })],
  ['yahtzee=50, fives filled', cardWith({ yahtzee: 50, fives: 20 })],
  ['yahtzee=0, fours filled', cardWith({ yahtzee: 0, fours: 8 })],
  ['yahtzee=50, sixes filled, all lower filled', cardWith({
    yahtzee: 50, sixes: 30, 'three-kind': 20, 'four-kind': 22, 'full-house': 25,
    'small-straight': 30, 'large-straight': 40, chance: 24,
  })],
  ['yahtzee=0, all lower + all upper except threes', cardWith({
    yahtzee: 0, ones: 3, twos: 4, fours: 8, fives: 10, sixes: 12,
    'three-kind': 20, 'four-kind': 22, 'full-house': 25, 'small-straight': 30,
    'large-straight': 40, chance: 24,
  })],
  ['no yahtzee box yet, everything else filled', cardWith({
    ones: 3, twos: 4, threes: 6, fours: 8, fives: 10, sixes: 12,
    'three-kind': 20, 'four-kind': 22, 'full-house': 25, 'small-straight': 30,
    'large-straight': 40, chance: 24,
  })],
];

test('scoreFor matches the independent oracle for every roll', () => {
  for (let n = 0; n < 6 ** 5; n++) {
    const dice = [0, 1, 2, 3, 4].map((i) => 1 + Math.floor(n / 6 ** i) % 6);
    for (const k of ORACLE_KEYS) {
      assert.equal(scoreFor(k, dice), oracleScore(k, dice),
        `scoreFor(${k}, [${dice}])`);
    }
  }
});

test('five of a kind is never a full house', () => {
  for (let f = 1; f <= 6; f++) {
    const d = [f, f, f, f, f];
    assert.equal(scoreFor('full-house', d), 0, `full house for five ${f}s`);
    assert.equal(oracleScore('full-house', d), 0);
  }
});

test('potential + allowedBoxes match the oracle Joker across all rolls and cards', () => {
  for (let n = 0; n < 6 ** 5; n++) {
    const dice = [0, 1, 2, 3, 4].map((i) => 1 + Math.floor(n / 6 ** i) % 6);
    for (const [label, card] of CARDS) {
      const oj = oracleJoker(card, dice);
      const engAllowed = allowedBoxes(card, dice);
      const expectAllowed = oj
        ? oj.allowed
        : CATEGORIES.filter((k) => card[k] === null || card[k] === undefined);
      assert.deepEqual([...engAllowed].sort(), [...expectAllowed].sort(),
        `allowedBoxes for ${label} with [${dice}]`);
      for (const k of ORACLE_KEYS) {
        const want = oj && oj.allowed.includes(k) ? oj.values[k] : oracleScore(k, dice);
        assert.equal(potential(card, k, dice), want,
          `potential(${k}) for ${label} with [${dice}]`);
      }
      // the engine must agree with the oracle on whether the Joker is in force
      assert.equal(jokerRule(card, dice) === null, oj === null,
        `jokerRule nullness for ${label} with [${dice}]`);
      // bonus only when the yahtzee box holds exactly 50
      const wantBonus = card.yahtzee === 50 && isFive(dice) ? 100 : 0;
      assert.equal(bonusEarned(card, dice), wantBonus,
        `bonusEarned for ${label} with [${dice}]`);
    }
  }
});

test('forced Joker: a Yahtzee whose upper box is open can go nowhere else', () => {
  for (let face = 1; face <= 6; face++) {
    const dice = [face, face, face, face, face];
    const card = cardWith({ yahtzee: 50 });
    assert.deepEqual(allowedBoxes(card, dice), [UPPER[face - 1]],
      `five ${face}s must be forced into ${UPPER[face - 1]}`);
    assert.equal(potential(card, UPPER[face - 1], dice), face * 5);
  }
});

test('Joker lower boxes score 25/30/40 and the rest at the dice sum', () => {
  const card = cardWith({ yahtzee: 50, fours: 16 });
  const dice = [4, 4, 4, 4, 4];
  assert.equal(potential(card, 'full-house', dice), 25);
  assert.equal(potential(card, 'small-straight', dice), 30);
  assert.equal(potential(card, 'large-straight', dice), 40);
  assert.equal(potential(card, 'three-kind', dice), 20);
  assert.equal(potential(card, 'four-kind', dice), 20);
  assert.equal(potential(card, 'chance', dice), 20);
});

test('when the upper box and every lower box are full, only zeros in open upper boxes remain', () => {
  const card = cardWith({
    yahtzee: 50, threes: 15, 'three-kind': 20, 'four-kind': 22, 'full-house': 25,
    'small-straight': 30, 'large-straight': 40, chance: 24,
  });
  const dice = [3, 3, 3, 3, 3];
  assert.deepEqual([...allowedBoxes(card, dice)].sort(),
    ['ones', 'twos', 'fours', 'fives', 'sixes'].sort());
  for (const k of allowedBoxes(card, dice)) assert.equal(potential(card, k, dice), 0);
});

test('a Yahtzee box holding 0 earns no bonus but still forces placement', () => {
  const card = cardWith({ yahtzee: 0 });
  const dice = [2, 2, 2, 2, 2];
  assert.equal(bonusEarned(card, dice), 0);
  assert.deepEqual(allowedBoxes(card, dice), ['twos']);
});
