# Everything the operator said to the builder

The run was launched from [`brief.md`](brief.md) with the frozen acceptance checks in [`checks/`](checks/). After launch, these two messages were the builder's only input, verbatim. The builder asks no questions, and nobody answers any.

## Operator feedback #1

_2026-09-28 18:28 UTC_

> Product direction from the operator (2026-09-28, 18:40 UTC). The game so far looks great: Camp Yahtzee, the felt tray, the "Now playing" banner, and a scorecard that fits one screen with the best box lit. Keep all of it.
>
> Something I didn't say clearly enough: at camp we'll roll REAL dice on the table. The phone's main job is to keep everybody's score. We need a real-dice mode, and it's now the most important path in the app.
>
> 1. A dice setting: "Dice: on this phone" or "Real dice at the table".
>    - Put it on the setup screen where nobody can miss it, and also make it reachable during a game (between turns is fine).
>    - Remember it across reloads and games. A first-ever visit starts on "on this phone", so today's behaviour and every check stay as they are.
>    - Switching never changes anyone's scores.
>
> 2. Real-dice mode: the player rolls at the table, then tells the phone what they ended with.
>    - No roll button, no rolls counter and no holding on screen. The dice tray becomes five slots to fill in.
>    - Entering the dice must take a couple of seconds with one thumb, for example a big 1-6 keypad where each tap fills the next slot. Tapping a filled slot lets you change it, and there's an obvious way to clear.
>    - The order the faces are entered doesn't matter.
>    - Once all five faces are in, the scorecard shows what each box would score, with exactly the same rules as now (upper bonus, Yahtzee bonus, forced Joker). One tap records, as today.
>    - Before five faces are in, nothing can be recorded.
>    - Everything else is unchanged: players, seating order, "Now playing", the scoreboard, the end of the game, Play again with rotation, and the session tally.
>
> 3. Mistakes will happen with real dice (a wrong face, or the wrong box tapped). Add an Undo for the last recorded box that puts the turn back exactly as it was. It must be available until the next player enters anything, and it applies in both modes.
>
> 4. The standings matter more now. Between turns, the phone sits in the middle of the table. Make the scoreboard (and during a game night, the session tally) easy to read from across the table.
>
> Keep every check green: they use "on this phone" mode, which must keep working exactly as it does today. Polish the real-dice path as carefully as the rest, since it's how we will actually play. Play several complete games in real-dice mode yourself with 3 and 8 players, then commit and finish.

## Operator feedback #2

_2026-09-29 08:59 UTC_

> Review of your claim (2026-09-29, 09:20 UTC). I played two complete real-dice games on a phone-sized screen, with 3 players and with 8, 143 turns in all. That included 24 Yahtzees and 13 Joker turns, an Undo, switching the dice mode mid-game, and a reload in the middle of entering dice. Every box value, Joker restriction, bonus, total, the standings, the tally and the starting-player rotation were right. The winner screen and "Tonight's tally" are lovely. This is nearly done.
>
> One thing must be fixed, because at the table it will cause wrong scores:
>
> 1. The keypad faces are wrong. Every key has an orange disc in its top-right corner, even when nothing has been entered, and the disc sits exactly on a pip. So the 4 key shows three pips, the 5 key shows four and the 6 key shows five. Someone matching the dice on the table to the keys will tap the wrong face.
>    - Every key must show its full, correct face at all times.
>    - The per-face count must never cover a pip. Put it outside the face, or under it, and show nothing when the count is zero.
>    - Also put the number on or under each key (1-6). The faces then read even in poor light.
>    - Check each key at 390x844 and 375x667, in light and dark.
>
> Two small things while you're there:
>
> 2. The hand-over banner ("Full house 25 — pass to Maya") covers the Sixes box and the bottom of the scorecard for a moment. Let it sit where it covers nothing the next player needs, or shorten it.
> 3. "Undo Eduard's" reads oddly. Say what will be undone, for example "Undo Eduard's Full house (25)".
>
> Keep every check green, look at the keypad yourself in both themes and on both phone sizes, commit, and finish.
