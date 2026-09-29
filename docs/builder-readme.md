# Camp Yahtzee

Yahtzee for one iPhone passed around a camp table. Official rules, 1–8 players on one
device, no backend, and it plays with no signal after a single visit.

## Try it
```sh
node build.mjs            # src/ -> public/ (one classic script + hashed service worker)
node serve.mjs public 3000
```
Open http://localhost:3000 — or host `public/` anywhere under a sub-path (GitHub Pages):
every URL in the app is relative.

## Tests
```sh
node --test tests/rules.test.js                    # 17 rules-engine unit tests
npx playwright test                                # the acceptance contract in checks/
npx playwright test --config playwright.audit.config.ts   # my own contrast/tap/overflow audit
node scripts/longgame.mjs                          # 3 full 3-player games, verified score by score
node scripts/offline.mjs                           # service worker: go offline mid-turn and keep playing
node scripts/edge.mjs                              # 8-player game, undo, reload resume, reduced motion
node scripts/gen-icons.mjs                         # redraws public/icons/*.png
```

## Layout
| path | what |
|---|---|
| `src/rules.js` | pure rules engine: scoring, upper bonus, Yahtzee bonus, forced Joker, turn order, session |
| `src/app.js` | UI, state, persistence (`localStorage`), test hook |
| `src/index.html`, `src/styles.css` | markup + phone-first design system (light/dark) |
| `src/sw.js`, `src/manifest.webmanifest` | offline + home-screen install |
| `build.mjs`, `serve.mjs` | build and static server |

Rules are never bendable: the engine is pure and unit-tested; the UI only renders it.
