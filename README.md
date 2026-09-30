# CyberNet: AI Academy — Alliances & Collectibles

A single-player browser strategy & trading game with a cyberpunk terminal look. Every other "player" is a simulated bot: they train, compete in the arena, trade NFTs, buy land and run guilds.

**Play:** open `index.html` in a browser, or enable GitHub Pages (Settings → Pages → Deploy from branch → `main` / root).

## What's inside

| System | Summary |
|---|---|
| AI pet | Math IQ, Trivia DB, Processing speed (ms, floor 150 ms). Training uses Data Tokens with diminishing returns past a per-league soft cap. |
| Training stands | x2 → x10 on your own land, max 3, hourly upkeep, higher tiers gated by league. |
| Arena | Solo (10 rounds, 3 lives, stamina) and Multiplayer (5–9 bots near your rating, live rounds, pool split by score). 2 Human Overrides per match. |
| Leagues | Bronze → Silver → Gold → Platinum → Diamond → Neural. Harder questions, stronger bots, higher rewards. |
| NFTs | 6 themes × 5 slots, 4 rarities, 5 affix types. Every NFT is drawn procedurally from its own DNA. 10 equip slots, set bonuses, global caps, fusion up to level 10, shards for bad luck. |
| Guilds | 10% tax minted as a bonus, Guild HQ (5 levels), cosmetics (themes, fonts, badges). |
| Market | Server market + your own Marketplace Stand with 2% commission on routed trades. |
| Global server | Land price rises with scarcity; below 50% free space heavy building freezes for 60 s, then capacity grows +50%. |
| Long term | 14-day seasons, daily missions, weekly events, 40 achievements, leaderboards, Neural Rebirth prestige. |

Offline progress is simulated for up to 8 hours when you come back.

## Code layout

```
index.html        page shell
css/style.css     theme, layout, responsive rules
js/config.js      ALL balance numbers (edit here to rebalance)
js/core.js        seeded RNG, state, currencies, log, save/load
js/data.js        trivia bank (178 questions), names
js/questions.js   math generator + trivia picker
js/sim.js         world, pet, bonuses & caps, stands, land, server, simulation step
js/nft.js         minting, drops, fusion, shards
js/guild.js       guild simulation, HQ, cosmetics
js/market.js      bot market, player listings, marketplace stand
js/meta.js        missions, achievements, seasons, prestige, leaderboards
js/arena.js       matches, AI answer model, Human Override, rating
js/actions.js     every player action (validate -> pay -> apply -> log)
js/art.js         procedural SVG art: NFTs, pet, emblems, icons, map, charts
js/tests.js       self-tests
js/ui.js          rendering and input
js/main.js        boot, game loop, offline catch-up, autosave
tests/run.js      run the self-tests in Node
```

## Tests

```
node tests/run.js          # full suite
node tests/run.js --quick  # faster
```

In the game: tap the logo 5 times (or press the backtick key, or open with `?debug=1`) for the debug panel: time speed, cheats for testing, economy stats and the self-tests.
