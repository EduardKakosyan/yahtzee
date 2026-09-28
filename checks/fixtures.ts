import { expect, type Page } from '@playwright/test';

export const PHONE = { width: 390, height: 844 };
export const SMALL_PHONE = { width: 375, height: 667 };

export const CATEGORIES = [
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'three-kind', 'four-kind', 'full-house', 'small-straight', 'large-straight', 'yahtzee', 'chance',
] as const;
export type Category = typeof CATEGORIES[number];
export const UPPER: Category[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
export const LOWER: Category[] = CATEGORIES.filter((c) => !UPPER.includes(c));

/* --------------------------------------------------------------------------
 * The official scoring rules, as the brief states them (no Joker here: the
 * Joker cases are asserted directly in joker.spec.ts).
 * -------------------------------------------------------------------------- */

const sum = (d: number[]) => d.reduce((a, b) => a + b, 0);
const counts = (d: number[]) => [1, 2, 3, 4, 5, 6].map((f) => d.filter((x) => x === f).length);
const hasRun = (d: number[], len: number) => {
  const set = new Set(d);
  for (let start = 1; start + len - 1 <= 6; start++) {
    let ok = true;
    for (let f = start; f < start + len; f++) if (!set.has(f)) ok = false;
    if (ok) return true;
  }
  return false;
};

export function scoreFor(cat: Category, d: number[]): number {
  const c = counts(d);
  const upper = UPPER.indexOf(cat);
  if (upper >= 0) return c[upper] * (upper + 1);
  switch (cat) {
    case 'three-kind': return c.some((n) => n >= 3) ? sum(d) : 0;
    case 'four-kind': return c.some((n) => n >= 4) ? sum(d) : 0;
    case 'full-house': return c.includes(3) && c.includes(2) ? 25 : 0;
    case 'small-straight': return hasRun(d, 4) ? 30 : 0;
    case 'large-straight': return hasRun(d, 5) ? 40 : 0;
    case 'yahtzee': return c.includes(5) ? 50 : 0;
    case 'chance': return sum(d);
  }
  return 0;
}

/* --------------------------------------------------------------------------
 * Driving the app
 * -------------------------------------------------------------------------- */

/** Queue die values: each die a roll changes takes the next queued value (brief: test hook). */
export async function queueDice(page: Page, values: number[]) {
  await page.evaluate((v) => {
    const w = window as unknown as { __yahtzeeDice?: number[] };
    if (!Array.isArray(w.__yahtzeeDice)) w.__yahtzeeDice = [];
    w.__yahtzeeDice.push(...v);
  }, values);
}

export async function diceValues(page: Page): Promise<string[]> {
  return page.getByTestId('die').evaluateAll((els) => els.map((e) => e.getAttribute('data-value') ?? ''));
}

/** Roll with the given values for the dice that change, and wait until all five dice show `expected`. */
export async function roll(page: Page, values: number[], expected?: number[]) {
  await queueDice(page, values);
  await page.getByTestId('roll').click();
  const want = (expected ?? values).map(String);
  await expect.poll(() => diceValues(page), { timeout: 5_000 }).toEqual(want);
}

export async function addPlayers(page: Page, names: string[]) {
  const input = page.getByLabel('Player name', { exact: true });
  for (const n of names) {
    await input.fill(n);
    await page.getByTestId('add-player').click();
  }
}

/** Fresh visit, add the players, start the game. */
export async function startGame(page: Page, names: string[], viewport = PHONE) {
  await page.setViewportSize(viewport);
  await page.goto('/');
  await expect(page.getByTestId('setup')).toBeVisible();
  await addPlayers(page, names);
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('game')).toBeVisible();
  await expect(page.getByTestId('current-player')).toHaveText(names[0]);
}

export const scoreButton = (page: Page, cat: Category) => page.getByTestId(`score-${cat}`);
export const scoreValue = (page: Page, cat: Category) => scoreButton(page, cat).getByTestId('score-value');

/** One whole turn in a 1-player game: a single roll of `dice`, then record `cat`. */
export async function playTurn(page: Page, dice: number[], cat: Category) {
  await roll(page, dice);
  await scoreButton(page, cat).click();
  await expect.poll(async () =>
    (await page.getByTestId('game-over').isVisible())
    || (await scoreButton(page, cat).getAttribute('data-state')) === 'recorded',
  { timeout: 5_000 }).toBe(true);
}

export interface PlannedTurn { dice: number[]; cat: Category }

/** Plays turns for several players, alternating in seating order, one round at a time. */
export async function playRounds(page: Page, names: string[], plans: PlannedTurn[][], rounds: number) {
  for (let r = 0; r < rounds; r++) {
    for (let p = 0; p < names.length; p++) {
      await expect(page.getByTestId('current-player')).toHaveText(names[p]);
      const t = plans[p][r];
      await roll(page, t.dice);
      await scoreButton(page, t.cat).click();
    }
  }
}

/** Grand total of a plan by the brief's rules (upper bonus; Yahtzee bonus not used in plans). */
export function planTotal(plan: PlannedTurn[]): number {
  let upper = 0;
  let lower = 0;
  for (const t of plan) {
    const s = scoreFor(t.cat, t.dice);
    if (UPPER.includes(t.cat)) upper += s; else lower += s;
  }
  return upper + (upper >= 63 ? 35 : 0) + lower;
}

/** Two complete 13-turn plans: Ana gets the upper bonus and every lower box; Ben scores little. */
export const ANA: PlannedTurn[] = [
  { dice: [6, 6, 6, 1, 2], cat: 'sixes' },
  { dice: [5, 5, 5, 1, 2], cat: 'fives' },
  { dice: [4, 4, 4, 1, 2], cat: 'fours' },
  { dice: [3, 3, 3, 1, 2], cat: 'threes' },
  { dice: [2, 2, 2, 1, 3], cat: 'twos' },
  { dice: [1, 1, 1, 2, 3], cat: 'ones' },
  { dice: [3, 3, 3, 4, 5], cat: 'three-kind' },
  { dice: [2, 2, 2, 2, 5], cat: 'four-kind' },
  { dice: [2, 2, 3, 3, 3], cat: 'full-house' },
  { dice: [1, 2, 3, 4, 6], cat: 'small-straight' },
  { dice: [2, 3, 4, 5, 6], cat: 'large-straight' },
  { dice: [5, 5, 5, 5, 5], cat: 'yahtzee' },
  { dice: [6, 6, 5, 4, 1], cat: 'chance' },
];
export const BEN: PlannedTurn[] = [
  { dice: [1, 2, 3, 4, 6], cat: 'ones' },
  { dice: [1, 2, 3, 4, 6], cat: 'twos' },
  { dice: [1, 2, 3, 4, 6], cat: 'threes' },
  { dice: [1, 2, 3, 4, 6], cat: 'fours' },
  { dice: [1, 2, 3, 4, 6], cat: 'fives' },
  { dice: [1, 2, 3, 4, 6], cat: 'sixes' },
  { dice: [1, 2, 3, 4, 6], cat: 'three-kind' },
  { dice: [1, 2, 3, 4, 6], cat: 'four-kind' },
  { dice: [1, 2, 3, 4, 6], cat: 'full-house' },
  { dice: [1, 2, 3, 4, 6], cat: 'small-straight' },
  { dice: [1, 2, 3, 4, 6], cat: 'large-straight' },
  { dice: [1, 2, 3, 4, 6], cat: 'yahtzee' },
  { dice: [1, 2, 3, 4, 6], cat: 'chance' },
];

/* --------------------------------------------------------------------------
 * Visual states for the phone checks
 * -------------------------------------------------------------------------- */

export type UIState = 'setup' | 'turn-start' | 'mid-turn' | 'game-over';

export async function openState(page: Page, state: UIState, viewport = PHONE) {
  await page.setViewportSize(viewport);
  await page.goto('/');
  await expect(page.getByTestId('setup')).toBeVisible();
  await addPlayers(page, ['Ana', 'Ben', 'Chloé']);
  if (state === 'setup') return;
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('game')).toBeVisible();
  if (state === 'turn-start') return;
  if (state === 'mid-turn') {
    await roll(page, [2, 2, 3, 3, 5]);
    await page.getByTestId('die').nth(0).click();
    await page.getByTestId('die').nth(1).click();
    return;
  }
  // game-over: a quick 1-player game on a fresh start
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await addPlayers(page, ['Ana']);
  await page.getByTestId('start-game').click();
  for (const t of ANA) await playTurn(page, t.dice, t.cat);
  await expect(page.getByTestId('game-over')).toBeVisible();
}
