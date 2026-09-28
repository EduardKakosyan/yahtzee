# Camp Yahtzee — builder notes

Static Yahtzee for one iPhone passed around a table. Contract lives in `checks/` (copied
from `/brief/checks`, read-only by agreement — never edit them to make them pass).

## Layout
- `src/rules.js` — pure rules engine (scoring, forced Joker, bonuses, turn order, session).
- `src/app.js` — UI/state/persistence. `src/index.html`, `src/styles.css`, `src/sw.js`,
  `src/manifest.webmanifest` are the other sources.
- `build.mjs` concatenates rules + app into ONE classic script (`public/app.js`) and stamps
  `public/sw.js` with a content hash for the cache name. No module/import maps at runtime,
  which keeps sub-path hosting (`/yahtzee/`) safe.
- `serve.mjs <dir> <port>` — static server. `node build.mjs && node serve.mjs public 3000`.
- `scripts/gen-icons.mjs` draws the PNG icons with Canvas in headless Chromium (PIL/cairo are
  not available here). `scripts/*.mjs` are my own Playwright probes (smoke / full games /
  offline / sub-path / reduced motion / 1-and-8 players).

## Run
- `node --test tests/rules.test.js` (17 unit tests)
- `npm run build && APP_URL=http://localhost:3000 npx playwright test`

## Contract gotchas (hard-won — do not "fix" the app by breaking these)
1. **The Joker condition.** `jokerRule` applies only once `card.yahtzee` is *settled* (not
   null) and the dice are five of a kind. A test rolls a Yahtzee with the box still open and
   clicks the Yahtzee box, so the first Yahtzee must not be restricted.
2. **Dice before the first roll:** `data-value` must be EMPTY (absent ok) and a tap must do
   nothing — so `<button class="die">` can never be `disabled` (Playwright refuses to click a
   disabled element). Use `#dice[data-armed=false]` styling for the "not rolled yet" look.
3. **Taps on `score-*` immediately record** and the next player must be interactive right away;
   no blocking overlay, no confirm. The hand-over banner is `pointer-events:none`.
4. **`aria-current="true"` goes on `scoreboard-row` itself**, and every row's text must equal
   the player name (`::after` content like " • to play" breaks `toHaveText`).
5. **Scorecard order is DOM order = ones…sixes, then the seven lower boxes** (two columns);
   the checks click the *last* row for the Joker's forced-zero case.
6. **`score-*` disabled ≠ dimmed text.** Contrast is measured on disabled boxes too; use
   dashed borders / surface colour, keep `color: var(--ink)` at ≥4.5:1.
7. **Contrast tooling quirk** (`checks/visual.ts::bgOf`): a gradient with color stops makes
   EVERY stop a candidate background, and a colour-mix() (which serialises to `color(...)`,
   unparseable) silently DELETES an ancestor's opaque colour, falling back to white. So: no
   gradients inside content areas, no `color-mix()` on any ancestor of text, and light
   surfaces in light mode / dark surfaces in dark mode — the tool's white fallback kills
   light-on-dark designs in light mode.
8. **Tap targets ≥44px** are measured for `button`, `[role=button]`, `.die`, `score-*`.
   Nothing may scroll sideways: keep decorative overflow inside `overflow:hidden`.
9. Test hook: unheld dice, left to right, take `window.__yahtzeeDice.shift()`. Keep it in
   production.
10. Service worker must work under a sub-path: relative `./sw.js`, relative cache keys,
    navigate fallback to `./index.html`.
11. **`.btn` sets `min-width: 44px`**, so a button in a flex row cannot shrink below its
    content. `.card-title` needs `min-width: 0` + ellipsis or a 16-char name spills the
    document past the viewport (that is a horizontal-scroll failure).
12. **Never let flex-basis percentages + gaps make a row wrap.** The four total chips used
    `flex: 1 1 24%` with `gap: 5px` and wrapped to a second row on BOTH phones, pushing the
    totals strip below the fold on iPhone SE. Use `flex: 1 1 0`.
13. **Anything `position:fixed` with `animation ... both` stays parked at its final frame.**
    The hand-over toast must be cleared in `finishGame()` or "pass to Yuki" floats over the
    winner reveal (and gets caught mid-fade at 2.4:1 contrast by the visual checks).
14. **`.btn`'s `display:inline-flex` beats the `hidden` attribute.** Hide helper buttons with
    the `.invisible` class (`visibility:hidden`), which also keeps layout stable.

## Verifying
`bash scripts/verify.sh` (or `npm run verify`) runs everything: unit+oracle tests, the
contract suite, my visual audit, layout fit, sub-path hosting, offline, SW-update path,
interaction hazards, edge cases, and three whole games re-checked against the engine.
It expects the built app on `$APP_URL` (default http://localhost:3000).
`audits/many-players.spec.ts` covers the 8-player extremes the contract suite never reaches.
Probe scripts live in `scripts/` and take `SHOT_URL`/`APP_URL`; they must be self-contained
(no leftover background servers on fixed ports — that already rotted once).

## Design system
Warm-tin "camp tin" theme, `--ink` on `--bg`, gold accent band for "whose turn / winner",
green felt tray for dice, two-column scorecard, per-player totals strip, live table board,
session tally. Light + dark follow the system, with manual toggles for theme, haptics
(off by default) and animation. Reduced motion is honoured in CSS and via `html.no-motion`.
