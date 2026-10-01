# AI Lab ↔ AI connection (AI_BRIDGE)

The **AI Lab** tab is where players teach the real AI (AiSynApps) by answering its questions in Romanian.
Right now the game runs **offline**: questions come from a local bank (`js/ailab.js`) and every answer is
kept in the save (`S.ai.collected`) so it can be exported as JSON (AI Lab → *Export answers*).

## How to connect the AI

1. Run an HTTP server on the AI side that implements the two routes below.
2. In the game: **Settings → AI Lab → AI address** (for example `http://localhost:8765`),
   or open the game with `?ai=http://localhost:8765`.
3. Empty address = offline mode again.

The server must allow CORS (`Access-Control-Allow-Origin: *`). When the game is served over HTTPS
(GitHub Pages), friends can only reach an **HTTPS** address; `http://localhost` works only on your own machine.

## Routes

### `POST /questions`
Request: `{ "count": 5, "player": "PlayerName" }`
Response:
```json
{ "questions": [
  { "id": "u-1287", "text": "Ce înseamnă „a-și lua inima în dinți”?", "kind": "open" },
  { "id": "ctl-7",  "text": "Câte zile are o săptămână?", "kind": "control", "accept": ["7", "sapte", "șapte"] }
] }
```
- `open` = something the AI does not know (from its UNKNOWN list) or wants to hear phrased differently.
- `control` = a question with a known answer, used to measure attention (anti-spam). Include ~1 per lesson.
- If the AI does not answer within 6 s the game falls back to the local bank.

### `POST /answers`
Request:
```json
{ "player": "PlayerName", "answers": [
  { "id": "u-1287", "kind": "open", "q": "…", "a": "…", "ok": true, "t": 123456, "src": "bridge" }
] }
```
Response: `{ "ok": true }`

`ok` is the game's quick filter (enough words, not spam, control answered correctly). The AI must still
decide on its own what to keep: **an answer becomes knowledge only when several independent players agree**,
and players who fail control questions should count less.

## Privacy
- Players accept a notice before the first lesson: answers are used to teach the AI Romanian; no personal data.
- E-mails, links and phone/ID-like numbers are replaced with `[ascuns]` before anything is stored or sent.
- Settings → *Delete my AI Lab answers* removes everything kept on the device.
