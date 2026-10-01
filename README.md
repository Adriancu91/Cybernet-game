# CyberNet: AI Academy — Cards, AI Lab & Alliances

A single-player browser strategy & trading game with a cyberpunk terminal look. Every other "player" is a simulated bot: they train, compete in the arena, trade NFTs, buy land and run guilds.

**Play:** open `index.html` in a browser, or enable GitHub Pages (Settings → Pages → Deploy from branch → `main` / root).

## What's inside

| System | Summary |
|---|---|
| AI pet | Math IQ, Trivia DB, Processing speed (ms, floor 150 ms). Training uses Data Tokens with diminishing returns past a per-league soft cap. |
| Training stands | x2 → x10 on your own land, max 3, hourly upkeep, higher tiers gated by league. |
| Arena | Solo (10 rounds, 3 lives, stamina) and Multiplayer (5–9 bots near your rating, live rounds, pool split by score). 2 Human Overrides per match. |
| Leagues | Bronze → Silver → Gold → Platinum → Diamond → Neural. Harder questions, stronger bots, higher rewards. |
| Cards | 4 fair types (Core, Virtual Memory, Hardware, Cooler), each with a fixed main stat. Rarities Common → Uncommon → Rare → Epic → Legendary, plus **Unique** (AI Lab only). Upgrade +0 → +4 with CR & shards, then evolve to the next rarity. 1–4 random bonus stats by rarity (Unique: 5), rerollable with a Neural Recalibrator. One card per type equipped; full rig = set bonus; Core & Hardware make heat, a Cooler removes it. Card album with rewards. Every card is drawn procedurally from its own DNA. |
| AI Lab | The AI asks questions in Romanian, the player answers in their own words. Energy +1/h (max 3), more from quiz wins. Every lesson: 1 Recalibrator guaranteed, CR & shards for useful answers, 35% card chance, Unique chance with a pity timer. Offline it uses a local bank and saves answers for export; `js/ai_bridge.js` + `docs/AI_BRIDGE.md` describe how to plug in the real AI. |
| Cloud accounts | Save with just an ID + PIN (no e-mail). Progress follows the player to any device; conflicts between devices are asked, never overwritten silently. Free Supabase backend: `supabase/setup.sql`, setup steps in `docs/CLOUD_SETUP.md`. Without it the game saves on the device as before. |
| Live quiz | Fresh trivia every day generated from Wikidata (capitals, chemical elements), cached 24 h, mixed with the built-in bank; falls back to the local bank when offline. |
| Guilds | 10% tax minted as a bonus, Guild HQ (5 levels), cosmetics (themes, fonts, badges). |
| Market | Card market + your own Marketplace Stand with 2% commission on routed trades. |
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
js/cards.js       cards: minting, stats, upgrade, evolve, reroll, heat, album, v1 NFT save migration
js/livequiz.js    daily trivia from Wikidata
js/ai_bridge.js   connection point for the real AI (offline by default)
js/ailab.js       AI Lab lessons, rewards, local question bank, privacy filter
js/cloud.js       ID + PIN cloud save (CLOUD_CONFIG: Supabase URL + anon key)
supabase/setup.sql  database tables + PIN-checked functions (paste into Supabase SQL Editor)
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
