# Brief: a Yahtzee game for one iPhone passed around a camp table

## What to build and for whom

A group of friends is at camp, maybe with no signal, sitting around one table with **one iPhone** that gets passed from player to player. Build them a **Yahtzee** game with the **original, official rules**. Those rules must not change. What changes is how it feels to play: make it **cooler than a paper scoresheet**. It needs big, tactile dice, a satisfying roll, an unmistakable "whose turn is it", and a finish that makes the winner feel like a winner.

Must-haves:
- **Any number of players from 1 to 8** on one device, taking turns in seating order.
- **Multiple games in a row.** After a game, "Play again" keeps the same friends, rotates who starts, and keeps a running tally for the evening (wins and points).
- **Works on an iPhone with no connection.** It's a web app the operator will host on GitHub Pages (under a sub-path, for example `/yahtzee/`). After one visit it must load and play fully offline, and it can be added to the home screen and launched like an app.
- **Never loses the game.** Safari may reload the page when the phone is locked or someone switches apps. The game resumes exactly where it was.

Budget: up to 40 hours. Get the contract below green early, then spend the time making it delightful on a real phone.

## Delivery and how it is served

- A static web app: plain HTML/CSS/JS, or a small framework with a **static build**. No backend and no accounts.
- The builder serves it with its `start_demo` tool on **port 3000**, and `GET /` returns the app. If there is a build step, serve the built output.
- **All URLs must be relative** (`app.js`, `./icons/icon-192.png`, never `/app.js` and never a CDN). The app will live under a sub-path on GitHub Pages. The same goes for the manifest's `start_url`, `scope` and icons, and for the service worker registration.
- No runtime network dependencies at all: no web fonts from a CDN, no analytics. Everything is bundled.

## The official rules (contract: checks assert these)

**Game.** 13 rounds. In each round every player takes one turn, in seating order. A turn: up to **three rolls** of five dice. After the first and second roll the player may **hold** any dice, and held dice keep their value on the next roll (tapping a held die releases it). After one, two or three rolls the player **must record a score in exactly one open box** of their scorecard. A recorded box is final. The game ends when every player has filled all 13 boxes.

**Scorecard.**

| Box (key) | Scores |
|---|---|
| Ones … Sixes (`ones` `twos` `threes` `fours` `fives` `sixes`) | the sum of the dice showing that number |
| Three of a kind (`three-kind`) | the sum of all five dice if at least three are the same, else 0 |
| Four of a kind (`four-kind`) | the sum of all five dice if at least four are the same, else 0 |
| Full house (`full-house`) | 25 for three of one number and two of another, else 0 (five of a kind is **not** a full house, except under the Joker rules) |
| Small straight (`small-straight`) | 30 for any four in sequence (1-2-3-4, 2-3-4-5 or 3-4-5-6), else 0 |
| Large straight (`large-straight`) | 40 for five in sequence, else 0 |
| Yahtzee (`yahtzee`) | 50 for five of a kind, else 0 |
| Chance (`chance`) | the sum of all five dice |

**Upper bonus.** If the six upper boxes total 63 or more, add 35.

**Yahtzee bonus and Joker rules.** These apply whenever a player rolls five of a kind and their Yahtzee box is **already filled**:
- If the Yahtzee box holds **50**, the player earns a **100-point Yahtzee bonus**, and each further Yahtzee earns another 100. If it holds **0**, there is no bonus, but the placement rules below still apply.
- Placement is the official "forced Joker":
  1. If the upper box for that number is open (for example Fours for five 4s), the player **must** score there (the sum of the dice).
  2. Otherwise they may score any open **lower** box. Full house scores 25, small straight 30 and large straight 40 as Jokers; three of a kind, four of a kind and chance score the sum of the dice.
  3. If that upper box and every lower box are filled, they must enter **0 in an open upper box** of their choice.
- Boxes the rules don't allow for this roll must not be selectable.

**Grand total** = upper section + upper bonus + lower section + Yahtzee bonus.

**Winner.** The highest grand total. On a tie, every tied player wins and each gets a win in the session tally.

## Screens and the testable contract

The checks drive the app through these `data-testid`s. Everything else about the look and layout is yours.

**Setup** (`setup`, shown on the first visit and whenever no game is in progress)
- A text input with a visible `<label>` whose text is exactly `Player name`, and a button `add-player`. Pressing Enter in the input also adds the player. The input clears after a player is added.
- Names are trimmed. Blank names and duplicates (ignoring case) are not added. At most **8** players: at 8, `add-player` is disabled.
- Each player appears, in seating order, as a `player-chip` containing the name and a `remove-player` button.
- `start-game` is disabled with no players and enabled with 1 to 8. The seating order is the order they were added.

**Game** (`game`)
- `current-player`: exactly the name of the player whose turn it is. Make it impossible to miss, since the phone is being handed over.
- `round`: contains `Round N of 13` (N = 1 to 13).
- Five dice `die`, in a fixed left-to-right order. Each has `data-value` = its face (`1` to `6`) after a roll, and **empty or absent before the turn's first roll**. Each has `aria-pressed="true"` when held, else `"false"`. Tapping a die toggles its hold, but only after the turn's first roll: before that, a tap does nothing. After a roll, `data-value` must settle on the final face within 1.5 s, so keep any tumble animation short. With `prefers-reduced-motion: reduce`, drop it or make it near-instant.
- `roll`: rolls every die that isn't held. It is disabled when no rolls are left. `rolls-left`: exactly `3`, `2`, `1` or `0`.
- The current player's scorecard: one element `score-<key>` per box (keys as in the table above), each tappable, showing the box's name and containing a `score-value`:
  - `data-state="recorded"` when filled. Then `score-value` is the recorded number and the element is disabled.
  - `data-state="open"` when not filled. After at least one roll, `score-value` shows exactly what the current dice would score there, with the Joker rules applied. It is enabled only if the rules allow that box for this roll. Before the turn's first roll, every box is disabled.
  - **Tapping an enabled open box records it at once.** There is no confirm step and no blocking "pass the phone" screen: the next player's turn is ready immediately. A short non-blocking hand-over animation or banner is welcome, and so is an optional **Undo** for the last recorded box before the next roll.
  - Disabled boxes must stay **readable**: players study their card before they roll. The contrast check applies to them too, so don't fade them below 4.5:1.
- For the current player: `upper-subtotal` (the upper section sum), `upper-bonus` (`35` or `0`), `yahtzee-bonus` (the total Yahtzee bonus, `0` by default) and `total` (the grand total). All are plain numbers.
- `scoreboard`: one `scoreboard-row` per player in seating order, each with `scoreboard-name` and `scoreboard-total` (the live grand total). The current player's row has `aria-current="true"`.
- After a player records a box, the turn passes to the next player in seating order. When it comes back to the starting player, the round increases. A new turn has no dice values, no holds, `rolls-left` = `3`, and every box disabled.

**Game over** (`game-over`, after the last box of round 13)
- `winner`: contains the winner's name. On a tie it contains every tied name.
- `final-row` per player, ordered by grand total (highest first; ties keep seating order), each with `final-name` and `final-total`.
- The session tally for the evening: `games-played` (contains the number of games finished), and one `session-row` per player in seating order with `session-name`, `session-wins` (a number) and `session-points` (the sum of their grand totals across the session's games).
- `play-again`: starts the next game at once with the same players in the same seating order, but **the next player starts**. Game 2 starts with player 2, game 3 with player 3, wrapping around. All scorecards clear, and the session tally carries on.
- A way back to setup to change the players. Changing the player list starts a new session.

**Test hook (required, keep it in production).** When `window.__yahtzeeDice` is a non-empty array, each die that a roll changes (the unheld dice, left to right) takes its value from `window.__yahtzeeDice.shift()` instead of randomness. Otherwise the dice are fair and random (`crypto.getRandomValues` is fine). The checks use this to roll known dice.

**Persistence.** Save the whole state after every action: setup players, the game, dice, holds, rolls left, scorecards, bonuses, the session tally, and which screen is showing. A reload resumes exactly there.

## iPhone, home screen and offline (contract)

- `<meta name="viewport" content="width=device-width, …">`. Respect the notch and home bar (`viewport-fit=cover` plus safe-area insets).
- A web app manifest (`<link rel="manifest">`) with a `name`, `"display": "standalone"`, relative `start_url` and `scope`, and PNG icons of **192×192 and 512×512**. Also a `<link rel="apple-touch-icon">` (180×180 PNG). Design a real icon: it will sit on a home screen.
- A service worker, registered with a relative URL, that precaches everything, so after one online visit the app loads and plays with **no connection**. Handle updates sensibly: a new version should take over on the next launch without trapping anyone on a stale build forever.

## Design direction (human-judged, and the point of the 40 hours)

- **Phone first, portrait**, at 390×844 and down to 375×667 (iPhone SE). The whole turn (whose turn it is, dice, roll button, and at least the boxes that matter) should work with one hand, with little or no scrolling during a turn. Make the scorecard easy to read and **hard to mis-tap**, since tapping records at once.
- **Cooler than paper.** Make the dice feel physical: pips, depth, a quick satisfying tumble, and held dice clearly "set aside". Add a moment for a Yahtzee and a proper winner reveal. Show which boxes are good options without deciding for the player.
- **Camp conditions.** Readable in bright sun and in the dark (a dark theme that follows the system is welcome; a manual toggle is optional). Big type for names and totals. Consider keeping the screen awake during a game (Screen Wake Lock) and a light haptic or sound, off by default if it could annoy.
- **Everyone can see the standings.** The scoreboard and the session tally should be glanceable when the phone is put down in the middle of the table.
- A short **"How to play"** sheet with the rules above, reachable from setup and the game.
- The automated bar applies in every state above: text contrast ≥ 4.5:1 (3:1 for large text), every tappable thing ≥ 44×44 px, no sideways scrolling, and a background that covers the screen.

## Constraints and non-goals

- Node 22 / pnpm are available. No API keys, no paid services, no network at runtime.
- Non-goals: online multiplayer, accounts, AI opponents, other variants (Triple Yahtzee, house rules), leaderboards across devices, ads.

## How the checks run

Playwright 1.63 with Chromium, `baseURL = APP_URL`. Every test starts in a fresh browser context (empty storage), mostly at 390×844. The checks add players through the setup contract, queue dice through `window.__yahtzeeDice`, click `roll`, and wait for the five `data-value`s to match. They play whole games (2 players × 13 rounds) and check the scorecard values, bonuses, Joker restrictions, winner, standings, session tally and starting-player rotation. They reload mid-turn. They check the manifest, icons and relative URLs. Then, through a `localhost` pass-through (service workers need a secure origin), they let the service worker install, go offline, reload and play. The visual checks measure contrast, tap targets, overflow and background coverage at 390×844 and 375×667 in four states: setup with three players, the start of a turn, mid-turn with dice held, and game over. You can read `checks/`.

## Plan for the builder

1. **Rules engine first**, as pure functions with your own unit tests (scoring, Joker, bonuses, turn order, game end, session), before any UI polish.
2. **Contract UI.** Wire setup, game and game over with every test id. Copy `checks/` next to a Playwright config with `baseURL = http://localhost:3000`, serve on 3000, and run `APP_URL=http://localhost:3000 npx playwright test` until it's green.
3. **Offline and home screen**: the manifest, icons, the service worker, relative URLs. Test offline yourself, and test that it works when served from a sub-path (for example serve the build under `/yahtzee/`).
4. **Design passes. Spend real time here.** Screenshot every state at 390×844 and 375×667, in light and dark, look at them yourself, and iterate on the dice, the roll, the turn hand-over, the scorecard, the Yahtzee moment and the winner reveal. Write your own audit scripts for contrast, tap targets and overflow, and play several complete games with 1, 3 and 8 players.
5. **Finish.** Run the full check suite twice in a row (green and stable), leave the app served by `start_demo` on port 3000, and use `report_progress` as each piece lands.

## Acceptance summary

Automated:
- players and turn order;
- dice, holds and three rolls;
- official scoring and the upper bonus;
- the Yahtzee bonus and forced Joker;
- full games, "Play again" with rotation, and the session tally;
- resume after reload;
- home-screen install and offline play;
- phone readability, tap targets and overflow.

Human judgment:
- fun at the camp table;
- a distinctive, polished look.
