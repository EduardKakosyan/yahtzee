import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES, UPPER, LOWER, ROUNDS,
  scoreFor, allowedBoxes, potential, jokerRule, bonusEarned,
  upperSubtotal, upperBonus, grandTotal, emptyCard,
  newGame, rollDice, toggleHold, record, undo,
  currentPlayer, roundOf, standings, winners,
  sessionFromGame, mergeSession,
} from '../src/rules.js';

const rng = (seq) => {
  let i = 0;
  return () => seq[i++ % seq.length];
};

test('upper boxes score the sum of that face', () => {
  const d = [3, 3, 3, 5, 2];
  assert.equal(scoreFor('ones', d), 0);
  assert.equal(scoreFor('twos', d), 2);
  assert.equal(scoreFor('threes', d), 9);
  assert.equal(scoreFor('fours', d), 0);
  assert.equal(scoreFor('fives', d), 5);
  assert.equal(scoreFor('sixes', d), 0);
});

test('lower boxes follow the official table', () => {
  assert.equal(scoreFor('three-kind', [3, 3, 3, 5, 2]), 16);
  assert.equal(scoreFor('four-kind', [3, 3, 3, 5, 2]), 0);
  assert.equal(scoreFor('four-kind', [5, 5, 5, 5, 1]), 21);
  assert.equal(scoreFor('full-house', [2, 2, 3, 3, 3]), 25);
  assert.equal(scoreFor('full-house', [6, 6, 6, 6, 6]), 0, 'five of a kind is not a full house');
  assert.equal(scoreFor('small-straight', [1, 2, 3, 4, 6]), 30);
  assert.equal(scoreFor('small-straight', [2, 3, 4, 5, 6]), 30);
  assert.equal(scoreFor('small-straight', [1, 2, 3, 5, 6]), 0);
  assert.equal(scoreFor('large-straight', [2, 3, 4, 5, 6]), 40);
  assert.equal(scoreFor('large-straight', [1, 2, 3, 4, 6]), 0);
  assert.equal(scoreFor('yahtzee', [6, 6, 6, 6, 6]), 50);
  assert.equal(scoreFor('chance', [6, 6, 5, 4, 1]), 22);
});

test('upper bonus is 35 from 63', () => {
  const card = emptyCard();
  card.sixes = 18; card.fives = 15; card.fours = 12; card.threes = 9; card.twos = 6;
  assert.equal(upperSubtotal(card), 60);
  assert.equal(upperBonus(card), 0);
  card.ones = 3;
  assert.equal(upperSubtotal(card), 63);
  assert.equal(upperBonus(card), 35);
  assert.equal(grandTotal(card), 98);
});

test('the Joker is in force for a Yahtzee once the box is settled', () => {
  const card = emptyCard();
  card.yahtzee = 50;
  card.threes = 0;
  const j = jokerRule(card, [3, 3, 3, 3, 3]);
  assert.deepEqual(j.allowed, ['three-kind', 'four-kind', 'full-house', 'small-straight', 'large-straight', 'chance'],
    'every open lower box, Yahtzee box already settled');
  assert.equal(j.values['full-house'], 25);
  assert.equal(j.values['small-straight'], 30);
  assert.equal(j.values['large-straight'], 40);
  assert.equal(j.values['three-kind'], 15);
  assert.equal(j.values.chance, 15);
  assert.equal(bonusEarned(card, [3, 3, 3, 3, 3]), 100);

  card['three-kind'] = 0;
  assert.deepEqual(jokerRule(card, [3, 3, 3, 3, 3]).allowed,
    ['four-kind', 'full-house', 'small-straight', 'large-straight', 'chance']);
});

test('a Joker with an open upper box is forced into it', () => {
  const card = emptyCard();
  card.yahtzee = 50;
  assert.deepEqual(jokerRule(card, [4, 4, 4, 4, 4]).allowed, ['fours']);
  assert.equal(potential(card, 'fours', [4, 4, 4, 4, 4]), 20);
});

test('a Joker whose upper box and lower section are filled writes 0 in an upper box', () => {
  const card = emptyCard();
  card.yahtzee = 50; card.fours = 4;
  for (const k of LOWER) card[k] = 0;
  const j = jokerRule(card, [4, 4, 4, 4, 4]);
  assert.deepEqual(j.allowed, UPPER.filter((k) => k !== 'fours'));
  assert.equal(potential(card, 'ones', [4, 4, 4, 4, 4]), 0);
});

test('a Yahtzee box holding 0 earns no bonus but still follows the Joker', () => {
  const card = emptyCard();
  card.yahtzee = 0;
  assert.equal(bonusEarned(card, [5, 5, 5, 5, 5]), 0);
  assert.deepEqual(allowedBoxes(card, [5, 5, 5, 5, 5]), ['fives']);
});

test('a first Yahtzee may be recorded in the Yahtzee box', () => {
  const card = emptyCard();
  assert.ok(allowedBoxes(card, [2, 2, 2, 2, 2]).includes('yahtzee'));
});

test('a turn is three rolls, holds stick, and the roll button dies at zero', () => {
  const g = newGame(['Ana'], 0);
  assert.equal(g.rollsLeft, 3);
  assert.equal(g.rolledCount, 0);
  assert.equal(toggleHold(g, 0), false, 'no holds before the first roll');
  rollDice(g, rng([1, 2, 3, 4, 5]));
  assert.equal(g.rollsLeft, 2);
  assert.deepEqual(g.dice, [1, 2, 3, 4, 5]);
  toggleHold(g, 0);
  toggleHold(g, 1);
  assert.deepEqual(g.held, [true, true, false, false, false]);
  rollDice(g, rng([6, 6, 6]));
  assert.deepEqual(g.dice, [1, 2, 6, 6, 6], 'held dice keep their value');
  toggleHold(g, 0);
  rollDice(g, rng([4, 5, 5, 5]));
  assert.deepEqual(g.dice, [4, 2, 5, 5, 5]);
  assert.equal(g.rollsLeft, 0);
  assert.equal(rollDice(g, rng([1])), false);
});

test('scoring needs a roll, is final, and hands the turn over', () => {
  const g = newGame(['Ana', 'Ben'], 0);
  assert.equal(record(g, 'ones'), false, 'no roll yet');
  rollDice(g, rng([3, 3, 3, 5, 2]));
  assert.equal(record(g, 'threes'), true);
  assert.equal(g.players[0].card.threes, 9);
  assert.equal(g.turnIndex, 1);
  assert.equal(currentPlayer(g).name, 'Ben');
  assert.equal(g.rollsLeft, 3);
  assert.deepEqual(g.dice, [0, 0, 0, 0, 0]);
  assert.deepEqual(g.held, [false, false, false, false, false]);
  assert.equal(g.rolledCount, 0);
  rollDice(g, rng([3, 3, 3, 3, 3]));
  assert.equal(record(g, 'threes'), true, 'Ben may still open his own threes');
  assert.equal(g.players[0].card.threes, 9, "Ana's box stays final");
  assert.equal(g.players[1].card.threes, 15);
});

test('rounds advance when it comes back to the starting player', () => {
  const g = newGame(['Ana', 'Ben', 'Chloé'], 0);
  assert.equal(roundOf(g), 1);
  for (let i = 0; i < 3; i++) {
    rollDice(g, rng([i + 1, 1, 1, 1, 1]));
    record(g, UPPER[i]);
  }
  assert.equal(roundOf(g), 2);
  assert.equal(currentPlayer(g).name, 'Ana');
});

test('undo takes back the last box before the next roll', () => {
  const g = newGame(['Ana'], 0);
  rollDice(g, rng([3, 3, 3, 5, 2]));
  record(g, 'threes');
  assert.equal(undo(g), true);
  assert.equal(g.players[0].card.threes, null);
  assert.equal(g.turnIndex, 0);
  assert.equal(undo(g), false, 'nothing to undo twice');
});

test('a full game finishes after 13 rounds per player and ranks the standings', () => {
  const plans = [
    CATEGORIES.map(() => [6, 6, 6, 1, 2]),
    CATEGORIES.map(() => [1, 2, 3, 4, 6]),
  ];
  const g = newGame(['Ana', 'Ben'], 0);
  for (let r = 0; r < ROUNDS; r++) {
    for (let p = 0; p < 2; p++) {
      rollDice(g, rng(plans[p][0]));
      record(g, CATEGORIES[r]);
    }
  }
  assert.equal(g.finished, true);
  const expectTotal = (dice, taken) => {
    const c = emptyCard();
    CATEGORIES.forEach((k, i) => { c[k] = scoreFor(k, dice[i]); });
    return grandTotal(c);
  };
  assert.equal(grandTotal(g.players[0].card), expectTotal(plans[0], 0));
  assert.equal(grandTotal(g.players[1].card), expectTotal(plans[1], 1));
  const st = standings(g);
  assert.equal(st[0].name, 'Ana');
  assert.deepEqual(winners(g), ['Ana']);
});

test('ties name every tied player and hand each a win', () => {
  const g = newGame(['Ana', 'Ben'], 0);
  for (let r = 0; r < ROUNDS; r++) {
    for (let p = 0; p < 2; p++) {
      rollDice(g, rng([2, 2, 3, 4, 5]));
      record(g, CATEGORIES[r]);
    }
  }
  assert.equal(g.finished, true);
  assert.deepEqual(winners(g), ['Ana', 'Ben']);
  const s = sessionFromGame(g);
  assert.equal(s.players[0].wins, 1);
  assert.equal(s.players[1].wins, 1);
  assert.equal(s.gamesPlayed, 1);
  assert.equal(s.nextStart, 1, 'the next game starts one seat along');
});

test('the session tally accumulates across games and rotates the starter', () => {
  const g = newGame(['Ana', 'Ben'], 0);
  for (let r = 0; r < ROUNDS; r++) {
    for (let p = 0; p < 2; p++) {
      rollDice(g, rng(p === 0 ? [6, 6, 6, 6, 6] : [1, 1, 1, 1, 2]));
      record(g, CATEGORIES[r]);
    }
  }
  let s = sessionFromGame(g);
  assert.equal(s.nextStart, 1);
  const g2 = newGame(['Ana', 'Ben'], s.nextStart);
  assert.equal(currentPlayer(g2).name, 'Ben');
  for (let r = 0; r < ROUNDS; r++) {
    for (let p = 0; p < 2; p++) {
      rollDice(g2, rng([4, 4, 4, 1, 1]));
      record(g2, CATEGORIES[r]);
    }
  }
  s = mergeSession(s, g2);
  assert.equal(s.gamesPlayed, 2);
  assert.equal(s.nextStart, 0, 'wraps back to player one');
  assert.equal(s.players[0].points, grandTotal(g.players[0].card) + grandTotal(g2.players[0].card));
});

test('joker bonuses reach the grand total', () => {
  const g = newGame(['Ana'], 0);
  rollDice(g, rng([2, 2, 2, 2, 2]));
  record(g, 'yahtzee');
  assert.equal(g.players[0].card.yahtzee, 50);
  rollDice(g, rng([4, 4, 4, 4, 4]));
  assert.deepEqual(allowedBoxes(g.players[0].card, g.dice), ['fours']);
  record(g, 'fours');
  assert.equal(g.players[0].card.fours, 20);
  assert.equal(g.players[0].card.yahtzeeBonus, 100);
  assert.equal(grandTotal(g.players[0].card), 170);
});

test('the box list is complete and split the official way', () => {
  assert.equal(CATEGORIES.length, 13);
  assert.equal(UPPER.length, 6);
  assert.equal(LOWER.length, 7);
  assert.deepEqual(CATEGORIES.slice(0, 6), UPPER);
  assert.ok(CATEGORIES.every((c) => LOWER.includes(c) || UPPER.includes(c)));
});
