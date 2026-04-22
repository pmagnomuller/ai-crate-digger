# AI Crate Digger

**Your pocket companion for the crate-digging trip** — when the shop is busy and nobody has time to chat, you still get a knowledgeable nudge: *“What else is like this?”*, *“Something in this mood under $30”*, or *“More along these lines.”*  

AI Crate Digger bridges fuzzy taste (“warm deep house for a sunset”) with **your** vinyl catalog: semantic search over ingested records, then streaming answers grounded in real titles — not generic model guesses.

---

## What you get

- **Chat-style recommendations** — Describe mood, genre, budget, or “similar to X”; the assistant searches the catalog and explains picks in natural language.
- **Streaming responses (SSE)** — `POST /chat/stream` with a vinyl-focused system prompt; the model uses tools (`search_records`, `get_record_detail`) with **parallel** tool calls when it fires several at once.
- **Semantic search** — Embeddings over your MongoDB-backed catalog (seeded from Discogs).
- **Optional TTS** — Spoken summary on `final_answer` (disable with `includeAudio: false` for lighter payloads).
- **Legacy enrichment** — Price / availability helpers still wired via `RecordsModule` for demos and orchestration.

**Stack:** NestJS · MongoDB · Azure OpenAI · Vite client for local dev · Docker · GitHub Actions → Azure Container Apps.

---

## Quick start

1. Copy `.env.example` to `.env` and fill values.
2. `npm ci`
3. `docker compose up -d` (local MongoDB)
4. `npm run seed:discogs` — pulls releases from Discogs into `RecordEntity` rows (default target 200).
5. `npm run start:dev` — API on port 3000 (see your config).

**Cheap first run:** set `DISCOGS_SEED_TARGET=20` and `DISCOGS_SKIP_EMBEDDINGS=true` to seed without Azure embedding calls.

**Frontend (optional):** `npm run dev:client` — Vite app against the API.

---

## What `npm run seed:discogs` does

Runs `src/seed/discogs.seed.ts`:

1. Connects with `MONGODB_URI`
2. Paginates Discogs for releases (`DISCOGS_USER_TOKEN`)
3. Maps each release into `RecordEntity`
4. Generates embeddings **unless** `DISCOGS_SKIP_EMBEDDINGS=true`
5. Upserts by `discogsId` (re-runs update in place)

---

## Database & embeddings

- **DB:** MongoDB creates `ai-crate-digger` and collections on first write (usually during seed).
- **Record embeddings:** Written at seed time when `DISCOGS_SKIP_EMBEDDINGS=false`.
- **Query embeddings:** Built at runtime when you search — ephemeral per request.

---

## Run MongoDB locally

### Docker (recommended)

```bash
docker compose up -d
```

Stop: `docker compose down` · Nuke data: `docker compose down -v`

`.env`:

`MONGODB_URI=mongodb://localhost:27017/ai-crate-digger`

### Native (e.g. Homebrew)

```bash
brew services start mongodb-community
```

Same `MONGODB_URI` as above.

---

## Main endpoints

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/records/search` | Semantic search |
| `GET` | `/records/:recordId/price` | Price |
| `GET` | `/records/:recordId/availability` | Availability |
| `POST` | `/chat/stream` | SSE chat (JSON body) |

### Chat stream (SSE)

**Body (JSON):**

| Field | Type | Description |
|--------|------|-------------|
| `prompt` | string | **Required.** User message. |
| `history` | `{ role, content }[]` | Optional prior turns. |
| `includeAudio` | boolean | Default `true`. `false` skips TTS on `final_answer`. |
| `maxResults` | number | Max records per `search_records` (default `6`). |
| `verbosity` | `low` \| `medium` \| `high` | Response length. |
| `maxToolRounds` | number | Tool rounds (default `5`). |

**Events** (`data: <json>`):

- `session_start` — session options  
- `tool_call` / `tool_result` — tool I/O  
- `token` — streamed text  
- `final_answer` — `{ text, audio? }`

**Example:**

```bash
curl -Ns \
  -X POST "http://localhost:3000/chat/stream" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Deep house under $30","includeAudio":false,"verbosity":"low"}'
```

Pretty-print with [jq](https://jqlang.org/):

```bash
curl -Ns \
  -X POST "http://localhost:3000/chat/stream" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Recommend jazz vinyl","includeAudio":false}' \
| sed -n 's/^data: //p' \
| jq -r 'if .type=="token" then .data elif .type=="final_answer" then "\nFINAL:\n" + .data.text else empty end'
```

---

## Azure & CI/CD

Configure in GitHub and Azure Container Apps: `AZURE_CREDENTIALS`, `ACR_NAME`, `ACR_LOGIN_SERVER`, `ACA_APP_NAME`, `ACA_RESOURCE_GROUP`, plus runtime keys from `.env.example`.

---

More depth: [`docs/Architecture.md`](docs/Architecture.md), [`docs/Infrastructure.md`](docs/Infrastructure.md), [`docs/Evals.md`](docs/Evals.md). A local-only interview companion guide can live at `docs/APP-AND-INTERVIEW-GUIDE.md` (gitignored).
