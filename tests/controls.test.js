import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, rollDice, toggleHold, record, undo, restartTurn, setEntryFace, CATEGORIES } from '../src/rules.js';

test('undo history survives serialization and restores earlier turns after new dice', () => {
  let g = newGame(['Ana', 'Ben'], 1);
  rollDice(g, () => 3);
  toggleHold(g, 0);
  record(g, 'threes');
  rollDice(g, () => 4);
  record(g, 'fours');
  g = JSON.parse(JSON.stringify(g));
  rollDice(g, () => 6);
  assert.equal(undo(g), true);
  assert.equal(g.turnIndex, 0);
  assert.deepEqual(g.dice, [4, 4, 4, 4, 4]);
  assert.equal(g.players[0].card.fours, null);
  assert.equal(undo(g), true);
  assert.equal(g.turnIndex, 1);
  assert.equal(g.turnNumber, 0);
  assert.equal(g.players[1].card.threes, null);
  assert.deepEqual(g.held, [true, false, false, false, false]);
  assert.equal(g.rollsLeft, 2);
  assert.equal(undo(g), false);
});

test('undo reverses Yahtzee bonuses and permits a replacement score', () => {
  const g = newGame(['Ana']);
  rollDice(g, () => 3);
  record(g, 'yahtzee');
  rollDice(g, () => 4);
  record(g, 'fours');
  assert.equal(g.players[0].card.yahtzeeBonus, 100);
  undo(g);
  assert.equal(g.players[0].card.yahtzeeBonus, 0);
  record(g, 'fours');
  assert.equal(g.history.length, 2);
  undo(g);
  undo(g);
  assert.equal(g.players[0].card.yahtzeeBonus, 0);
  assert.equal(g.players[0].card.yahtzee, null);
});

test('final score can be undone and game completed again', () => {
  const g = newGame(['Ana']);
  for (const cat of CATEGORIES) {
    let i = 0;
    rollDice(g, () => [1, 2, 3, 4, 5][i++]);
    record(g, cat);
  }
  assert.equal(g.finished, true);
  assert.equal(restartTurn(g), false);
  assert.equal(undo(g), true);
  assert.equal(g.finished, false);
  assert.equal(g.turnNumber, 12);
  assert.equal(g.players[0].card.chance, null);
  assert.equal(record(g, 'chance'), true);
  assert.equal(g.finished, true);
});

test('restart clears dice and entry, not scores, turn order or history', () => {
  const g = newGame(['Ana', 'Ben']);
  for (let i = 0; i < 5; i++) setEntryFace(g, i, 2);
  record(g, 'twos');
  setEntryFace(g, 0, 6);
  const players = JSON.stringify(g.players);
  const rec = g.lastRecord;
  assert.equal(restartTurn(g), true);
  assert.equal(JSON.stringify(g.players), players);
  assert.equal(g.lastRecord, rec);
  assert.equal(g.turnNumber, 1);
  assert.equal(g.turnIndex, 1);
  assert.deepEqual(g.entry, [0, 0, 0, 0, 0]);
  assert.deepEqual(g.dice, [0, 0, 0, 0, 0]);
  assert.equal(g.rollsLeft, 3);
  assert.equal(undo(g), true);
  assert.deepEqual(g.entry, [2, 2, 2, 2, 2]);
});

test('older saves without history still allow undo of their last score', () => {
  const g = newGame(['Ana']);
  rollDice(g, () => 2);
  record(g, 'twos');
  delete g.history;
  rollDice(g, () => 3);
  record(g, 'threes');
  assert.equal(undo(g), true);
  assert.equal(undo(g), true);
  assert.equal(g.turnNumber, 0);
});
