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

## Faces must be faithful (the operator's blocker)
21. **A badge on a keypad key is a pip to the player.** The per-face count used to sit
    in the key's top-right corner — exactly the top-right pip's place — so the 4 key
    read as a three and the 6 as a five. Nothing may ever be painted over a pip: the
    number and count live in a strip UNDER the face, and show nothing at count 0.
22. **A die face is square.** `.key .kface-sq` is a centred square; on the SE a 52x56
    key otherwise squashed the pip grid to 42x30 and the 5's pips came within 0.6px of
    touching. Keypad/slot pips are 8px so every pip keeps clear air at the smallest size.
23. `scripts/keypad.mjs` *looks* at the app: it decodes the screenshot (scripts/png.mjs),
    thresholds the dark pips out of the cream face, counts connected components and
    matches their centres to the pip grid. CSS reasoning missed this bug; pixels didn't.
    Its crop must be the LAYOUT box — a held die is rotated, so its bounding box spills
    onto the dark felt and reads as one extra blob.

## The hand-over note (operator point 2)
24. It lives INSIDE the `.felt`, absolutely positioned over the dice/slots row
    (`positionHandover`), so it can only ever cover dice that are already spent. Anything
    `position:fixed` ends up over somebody's score or header icon, at any size. It holds
    full opacity (no fade-out frame for the contrast tool to catch) and `#screen-game`'s
    `pointerdown` hides it, so it steps aside the moment the new player reaches for a key
    — in table mode it would otherwise sit exactly on the slots they are about to fill.
25. **Undo says the whole thing** ("Undo Ana's 3 of a kind (18)"). `.card-head.has-undo`
    hides the "Ana's scorecard" title so the button owns the row's full width; the label
    then shrinks itself to 11px rather than ellipsising (a truncated Undo is the vagueness
    the label exists to remove). `scripts/handover.mjs` asserts `scrollWidth <= clientWidth`.
## Two dice modes (the operator's most important path)
- `prefs.dice` is `'phone'` (default, so every contract check behaves as before) or
  `'table'`. Real-dice state lives in the ENGINE (`g.entry` + `setEntryFace` /
  `clearEntry` / `syncEntry`), not the UI, so scoring, Joker and bonuses are shared
  and the entry resumes with the saved game for free. `syncEntry` sets
  `dice/rolledCount=1/rollsLeft=0` only when all five faces are in, so "nothing
  recordable before 5/5" falls out of the existing `rolledCount` gate.
- In table mode the tray swaps `#dice` + `#roll-row` for `#slots` + `#keypad`
  (`setTrayMode`). Hidden halves get `inert` too, and `[hidden] { display:none !important }`
  is global — `.btn`'s `display:inline-flex` otherwise beats `hidden`.
- Undo restores the WHOLE turn (`g.lastRecord.prev` = dice/held/rollsLeft/rolledCount/entry)
  and stays offered until the next player *touches* the turn (`turnTouched`), in both modes.
- Switching modes carries a half-played turn across (`transferTurn`) and is guarded by an
  assertion that no card string changed.

## More contract gotchas
15. **Four header icon buttons at 44px + gaps overflow 390px** (`html scrollWidth 405`).
    `.btn-icon` needs `width: 44px` and `.round-wrap` needs `flex:1 1 auto; min-width:0`.
16. **The hand-over toast is text the checks can catch mid-fade**: at 17px on `--ink`
    it measured 4.37:1 at 0.54 opacity. It is now 18px (large-text 3:1), its exit stops at
    0.6 opacity, and `showHandover` self-clears — a toast parked at final opacity is
    failure #13 all over again.
17. **Playwright refuses to click a hidden element.** In table mode `#roll` and the dice are
    genuinely hidden — probes and audits must not try to use them.
18. `$('board-note')` — renderBoard threw for 3 of the contract tests before the
    element had an id. Any new `$('…')` reference needs the id on the element.
19. **The board note doubles as the across-the-table session line** (operator point 4):
    once an evening tally exists it reads "Tonight · N games · leader X pts, Y wins".
20. An 18-char name (`Tomas Tomas Tomas T`) must fit the two-column grid at 390px: the key
    tools sit beside a `3 × 62px` pill rather than on their own row, which also keeps the
    whole keypad + first boxes above the SE fold.

## Verifying
`bash scripts/verify.sh` (or `npm run verify`) runs everything: unit+oracle tests, the (`realdice.mjs` plays whole table-mode games with 3 and 8 players and re-checks them against the engine; `audits/realdice.spec.ts` audits the keypad, slots and mode sheet, which the contract suite never sees)`bash scripts/verify.sh` (or `npm run verify`) runs everything: unit+oracle tests, the
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
