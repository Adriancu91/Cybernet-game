# Cloud accounts (ID + PIN) — one-time setup, about 10 minutes

Players save their progress with just an **ID** and a **PIN** (no e-mail, no confirmation).
The game stores it on a free Supabase database. Until this setup is done the game works
exactly as before (progress saved on the device only) and the account button is hidden.

## 1. Create the free database
1. Go to https://supabase.com → **Start your project** → sign up (GitHub login is the quickest).
2. **New project**: any name (e.g. `cybernet`), choose a database password (keep it, you won't need it in the game),
   region **Central EU (Frankfurt)**, plan **Free**. Wait ~2 minutes until it's ready.

## 2. Create the tables and functions
1. In the project: left menu → **SQL Editor** → **New query**.
2. Open `supabase/setup.sql` from this repo, copy everything, paste it, press **Run**.
   It should say *Success. No rows returned*. (Running it again later is safe.)

## 3. Put the two public values in the game
1. Left menu → **Project Settings** → **API** (or **Data API**).
2. Copy **Project URL** (looks like `https://abcdefgh.supabase.co`) and the **anon / public** key.
3. In `js/cloud.js` fill:
   ```js
   const CLOUD_CONFIG = {
     url: 'https://abcdefgh.supabase.co',
     anonKey: 'eyJhbGciOi...',
   };
   ```
   The anon key is meant to be public: the tables are locked (Row Level Security without policies) and
   the game can only call the `cn_*` functions, which check the PIN. **Never** put the `service_role` key in the game.

## What players see
- On a new device: *Log in / create account* or *Play as guest*.
- The ☁ button in the top bar shows the account; the game saves to the cloud every minute and when the tab is closed or hidden.
- If two devices play the same account, the game asks which progress to keep — nothing is overwritten silently.
- 5 wrong PINs lock the account for 15 minutes. PINs are stored as bcrypt hashes, never in clear.
- AI Lab answers of logged-in players are collected in the `cn_ai_answers` table (Supabase → Table Editor),
  ready for the AI to learn from.

## Free plan limits (enough for friends & family)
500 MB database (a save is ~60 KB → thousands of players), unlimited API calls. A free project is paused after
7 days without any activity; it wakes up from the Supabase dashboard (one click).

## Top realizări umane (global top)
`supabase/setup.sql` also creates the `cn_records` table and two functions:
- `cn_records_submit(user, pin, records)` — PIN-checked; stores the player's own records
  (Supraviețuire, Quiz Rapid, Adevărat/Fals, correct answers, duels won, territory). Records never decrease
  (territory can) and absurd values are capped.
- `cn_top(kind, limit)` — public read of the top for one category (`surv`, `quick`, `tf`, `correct`, `duels`, `territory`):
  only the account ID and the value.

If you set up the database before this feature existed, just run `setup.sql` again (it is safe to re-run).
With cloud enabled, the 🏆 Top card in the Arena mixes real players (badge **👤 real**) with the simulated ones;
logged-in players' records are sent automatically when they change. Without cloud (or if the server is down)
the Top works offline with the simulated players only.
