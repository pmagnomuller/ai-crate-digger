# Recurring Discovery Agent — Spec

## Summary

An autonomous agent that, on a schedule (daily/weekly/custom), generates personalized record recommendations for a user based on their taste profile, budget, catalog state, and past interactions. Results are delivered as an in-app digest and optionally exported to a Spotify and/or YouTube playlist.

This spec is written for the current stack:

- NestJS backend (`src/` modules)
- MongoDB via Mongoose (existing `records` collection with embeddings)
- Azure OpenAI chat + embeddings (already wired via `EmbeddingsService`, `ChatService`)
- Existing tools: `search_records`, `get_record_detail`, `check_availability`, `get_price`
- Existing semantic search in `RecordsService.semanticSearch`

## Goals

- Autonomous, schedulable recommendations without user prompting every time
- Personalization from taste profile + feedback loop
- Deduplication against what the user has already seen/owned/rejected
- Works with existing semantic search and record tools
- Optional export to Spotify and YouTube playlists
- Observable, testable, and safe to re-run (idempotent)

## Non-Goals (v1)

- Real-time cross-marketplace scraping (only internal catalog first)
- Payment/ordering automation
- Multi-user collaborative discovery (tracked separately in TODO)

---

## User-Facing Behavior

### Create a discovery job

User (via chat or UI) says:
> "Send me 10 deep-house picks under $40 every Friday morning. Avoid vocals and anything I've seen."

The system creates a `DiscoveryJob` with:

- objective (free text + structured extraction)
- frequency (`daily` / `weekly` / `cron`)
- delivery channels (`in_app`, `email`, `spotify`, `youtube`)
- constraints (budget, format, stock, genres, anti-preferences)
- novelty rules (exclude seen, dedupe by artist/label window)

### Each run

Agent autonomously:

1. Loads job + taste profile + seen history
2. Retrieves candidate pool from internal catalog
3. Enriches top candidates with price/availability
4. Scores and diversifies
5. Produces a digest
6. (Optional) Creates/updates external playlists
7. Sends delivery
8. Persists run + candidates for feedback + evals

### Feedback loop

Each recommendation has quick actions:
- `love`, `save`, `dismiss`, `too_expensive`, `too_similar`, `wrong_vibe`

Feedback updates:
- taste profile (weights)
- seen history
- job constraints (if user says "too expensive", raise budget sensitivity)

---

## Architecture Overview

```
+----------------+       +---------------------+       +-------------------+
|  Scheduler     |  -->  |  Discovery Worker   |  -->  |  Delivery Service |
|  (cron/queue)  |       |  (per-job pipeline) |       |  (chat/email/OAuth)|
+----------------+       +---------------------+       +-------------------+
        |                          |                            |
        v                          v                            v
  DiscoveryJobs             RecordsService                SpotifyClient
  DiscoveryRuns            EmbeddingsService              YouTubeClient
                           RecommendationsTools
                           TasteProfileService
```

New Nest modules:

- `DiscoveryModule`
- `TasteProfileModule`
- `IntegrationsModule` (Spotify + YouTube)

All live under `src/` next to existing modules.

---

## Data Model (MongoDB)

### `discovery_jobs`

```ts
{
  _id: ObjectId,
  userId: string,
  name: string,
  enabled: boolean,
  objective: string,
  structuredObjective: {
    genres?: string[],
    antiGenres?: string[],
    moods?: string[],
    sonicDescriptors?: string[],
    tempoBucket?: string,
    vocalPreference?: "instrumental" | "sparse" | "vocal-forward" | "any",
    energyMin?: number,
    energyMax?: number
  },
  constraints: {
    maxPrice?: number,
    minPrice?: number,
    formats?: string[],
    inStockOnly?: boolean,
    excludeLabels?: string[],
    excludeArtists?: string[]
  },
  novelty: {
    excludeSeenDays: number,
    maxSameArtist: number,
    maxSameLabel: number,
    wildcardCount: number
  },
  delivery: {
    channels: ("in_app" | "email" | "spotify" | "youtube")[],
    autoPlaylist?: boolean,
    playlistNameTemplate?: string
  },
  schedule: {
    type: "daily" | "weekly" | "cron",
    cron?: string,
    timezone: string,
    hour?: number,
    dayOfWeek?: number
  },
  maxResults: number,
  nextRunAt: Date,
  lastRunAt?: Date,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes:
- `{ userId: 1, enabled: 1 }`
- `{ nextRunAt: 1, enabled: 1 }`

### `discovery_runs`

```ts
{
  _id: ObjectId,
  jobId: ObjectId,
  userId: string,
  status: "pending" | "running" | "succeeded" | "failed" | "partial",
  startedAt: Date,
  finishedAt?: Date,
  error?: string,
  idempotencyKey: string, // jobId + runBucket (YYYY-MM-DD or ISO week)
  summary?: string,
  stats: {
    candidatePoolSize: number,
    rankedCount: number,
    deliveredCount: number,
    playlistCreated?: boolean
  }
}
```

Indexes:
- `{ jobId: 1, startedAt: -1 }`
- `{ idempotencyKey: 1 }` unique

### `discovery_candidates`

```ts
{
  _id: ObjectId,
  runId: ObjectId,
  jobId: ObjectId,
  userId: string,
  recordId: string,
  fitScore: number,
  noveltyScore: number,
  valueScore: number,
  availabilityConfidence: number,
  finalScore: number,
  reasons: string[],
  enrichment: {
    priceChecked: boolean,
    availabilityChecked: boolean,
    lastPrice?: number,
    inStock?: boolean
  },
  deliveredRank?: number,
  feedback?: {
    action: "love" | "save" | "dismiss" | "too_expensive" | "too_similar" | "wrong_vibe",
    at: Date,
    note?: string
  }
}
```

Indexes:
- `{ runId: 1, finalScore: -1 }`
- `{ userId: 1, recordId: 1 }`

### `taste_profiles`

```ts
{
  _id: ObjectId,
  userId: string,
  genres: Record<string, number>,           // weights
  antiGenres: Record<string, number>,
  moods: Record<string, number>,
  sonicDescriptors: Record<string, number>,
  referenceArtists: Record<string, number>,
  antiReferences: Record<string, number>,
  energyLevel?: number,
  tempoPreference?: string,
  vocalPreference?: string,
  priceSensitivity?: "low" | "medium" | "high",
  noveltyTolerance?: "low" | "medium" | "high",
  updatedAt: Date
}
```

### `seen_records`

```ts
{
  userId: string,
  recordId: string,
  firstSeenAt: Date,
  lastSeenAt: Date,
  contexts: string[],   // e.g., ["chat", "discovery:<jobId>"]
  action?: string       // last feedback action
}
```

Compound unique index: `{ userId: 1, recordId: 1 }`.

### `external_accounts`

```ts
{
  userId: string,
  provider: "spotify" | "youtube",
  accessTokenEnc: string,
  refreshTokenEnc: string,
  expiresAt: Date,
  scopes: string[],
  accountId: string
}
```

Tokens encrypted at rest using a Nest `CryptoService` (AES-GCM).

---

## Module Breakdown

### `src/discovery/`

- `discovery.module.ts`
- `discovery.controller.ts` — REST for CRUD + manual trigger
- `discovery.service.ts` — orchestration
- `schemas/discovery-job.schema.ts`
- `schemas/discovery-run.schema.ts`
- `schemas/discovery-candidate.schema.ts`
- `scheduler/discovery.scheduler.ts` — polls due jobs, enqueues work
- `worker/discovery.worker.ts` — runs the pipeline
- `ranking/discovery.ranker.ts` — pure scoring functions
- `dto/*.ts`

### `src/taste-profile/`

- `taste-profile.module.ts`
- `taste-profile.service.ts` — load, update, apply feedback
- `schemas/taste-profile.schema.ts`
- `dto/update-preferences.dto.ts`

### `src/integrations/`

- `integrations.module.ts`
- `spotify/spotify.service.ts`
- `youtube/youtube.service.ts`
- `oauth.controller.ts` — start/callback flows
- `external-accounts.schema.ts`
- `crypto.service.ts`

### `src/ai/tools/` (new tools)

- `create-discovery-job.tool.ts`
- `update-discovery-job.tool.ts`
- `trigger-discovery-run.tool.ts`
- `list-discovery-jobs.tool.ts`

Register them in `chat-tools.ts` so the chat can create/manage jobs by voice.

---

## API Surface

All under `/discovery` and `/integrations` prefixes.

### Jobs

- `POST /discovery/jobs` — create job
- `GET /discovery/jobs` — list jobs for user
- `GET /discovery/jobs/:id` — fetch job
- `PATCH /discovery/jobs/:id` — update
- `DELETE /discovery/jobs/:id` — delete
- `POST /discovery/jobs/:id/trigger` — manual run now

### Runs

- `GET /discovery/jobs/:id/runs` — history
- `GET /discovery/runs/:runId` — detail
- `GET /discovery/runs/:runId/candidates` — with scores/reasons

### Feedback

- `POST /discovery/candidates/:id/feedback` — body `{ action, note? }`

### Integrations

- `GET /integrations/spotify/connect` — OAuth start
- `GET /integrations/spotify/callback`
- `DELETE /integrations/spotify`
- `GET /integrations/youtube/connect`
- `GET /integrations/youtube/callback`
- `DELETE /integrations/youtube`

---

## Scheduling Model

Two options, pick one:

### Option A — In-process scheduler (simplest, v1)

Use `@nestjs/schedule`:

- `@Cron('*/1 * * * *')` tick every minute in `DiscoveryScheduler`
- Query `discovery_jobs` where `enabled = true` AND `nextRunAt <= now`
- For each job, `await this.worker.runJob(jobId)` with concurrency cap (p-limit = 3)
- On success: compute `nextRunAt` from `schedule` and save

### Option B — Queue-based (recommended at scale)

- BullMQ + Redis (already common in Nest)
- Scheduler produces jobs; worker consumes
- Retries + backoff built-in
- Better observability

Spec assumes Option A for v1, with a clean interface so Option B drops in later.

Idempotency:

- `idempotencyKey = jobId + runBucket`
  - daily: `YYYY-MM-DD`
  - weekly: `YYYY-Www`
- Unique index on `discovery_runs.idempotencyKey` prevents duplicates.

---

## Discovery Pipeline (worker)

Pseudo-code:

```ts
async function runJob(jobId: ObjectId) {
  const job = await jobs.findById(jobId);
  if (!job?.enabled) return;

  const run = await runs.createPending({ job });
  try {
    const profile = await tasteProfile.load(job.userId);
    const seen = await seenRecords.load(job.userId, job.novelty.excludeSeenDays);

    // 1) Build candidate pool
    const queries = buildQueries(job, profile);           // multiple diverse queries
    const embeddings = await embedAll(queries);
    const rawCandidates = await Promise.all(
      embeddings.map(e =>
        recordsService.semanticSearch(e, { limit: 50 })
      )
    );
    const pool = dedupeById(flatten(rawCandidates))
      .filter(r => !seen.has(r.id))
      .filter(r => passesHardConstraints(r, job));

    // 2) Score
    const scored = pool.map(r => ({
      record: r,
      ...scoreCandidate(r, job, profile)
    }));

    // 3) Enrich top K with price/availability
    const topK = topN(scored, 40);
    await enrichWithPriceAndStock(topK);
    const enriched = topK.filter(c =>
      job.constraints.inStockOnly ? c.enrichment.inStock : true
    );

    // 4) Diversify and pick final N
    const final = diversify(enriched, {
      count: job.maxResults,
      maxSameArtist: job.novelty.maxSameArtist,
      maxSameLabel: job.novelty.maxSameLabel,
      wildcardCount: job.novelty.wildcardCount
    });

    // 5) Persist candidates
    await candidates.insertMany(mapForInsert(run, final));

    // 6) Deliver
    const digest = await buildDigest(final, job, profile);
    await deliver(digest, job);

    // 7) Optional playlist export
    if (job.delivery.autoPlaylist) {
      await exportPlaylist(job, final, digest);
    }

    // 8) Mark seen + schedule next run
    await seenRecords.markMany(job.userId, final.map(x => x.record.id), `discovery:${jobId}`);
    await runs.markSucceeded(run._id, stats(final));
    await jobs.setNextRunAt(jobId, computeNextRunAt(job));
  } catch (err) {
    await runs.markFailed(run._id, err);
    throw err;
  }
}
```

### Query construction

Generate 3-5 diverse queries per run so retrieval is not over-fit:

- Primary: objective text + top 3 profile descriptors
- Alt 1: reference-artist based ("sounds like X but less Y")
- Alt 2: mood/context based ("late-night hypnotic")
- Alt 3: genre variation (adjacent genre to avoid echo chamber)
- Alt 4: wildcard (drop one top descriptor to widen the net)

Each query is embedded via `EmbeddingsService` and searched via `RecordsService.semanticSearch`.

### Scoring

Pure function, easy to unit test:

```ts
function scoreCandidate(r, job, profile) {
  const fit = tasteFit(r, profile, job.structuredObjective);      // 0..1
  const novelty = noveltyScore(r, profile);                        // 0..1
  const value = valueScore(r, job.constraints, profile);           // 0..1
  const availability = availabilityConfidence(r);                  // 0..1

  const finalScore =
    0.45 * fit +
    0.25 * novelty +
    0.20 * value +
    0.10 * availability;

  return { fitScore: fit, noveltyScore: novelty, valueScore: value, availabilityConfidence: availability, finalScore, reasons: explain(r, profile) };
}
```

- `tasteFit`: cosine sim on embeddings + weighted tag overlap + anti-preference penalties
- `noveltyScore`: lower if artist/label already in recent run candidates or in top profile weights beyond a saturation threshold
- `valueScore`: combine price vs `maxPrice` and (optionally) vs historical average
- `availabilityConfidence`: freshness of `last_verified_at` + stock state

### Diversification

Pick final N using a greedy selector:

- Sort by `finalScore` desc
- Keep picking if adding wouldn't exceed caps on same-artist / same-label / same-era
- Reserve `wildcardCount` slots for lower fit, higher novelty

---

## Delivery

### In-app chat digest

Emit via the existing SSE system or a new endpoint. Digest format:

```
Weekly Crate Digs — 2026-04-25
Vibe: late-night, warm drums, hypnotic grooves

1. [Record A] — why: matches "dusty" + mid-tempo groove; in stock at $32
2. [Record B] — why: adjacent to your Theo Parrish weight; new label for you
...
Wildcard: [Record G] — not your usual pocket, but same "nocturnal" mood

Feedback: love · save · dismiss · too_expensive · wrong_vibe
```

Keep a generator that produces both:

- structured JSON (for UI cards)
- short natural language paragraph (for TTS + email)

### Email (optional v1)

Use a simple transactional provider. Send the natural-language version + links.

### Spotify export

- Match each record to Spotify tracks via search (artist + title + album)
- Create or rotate playlist named from `playlistNameTemplate`
- Persist mapping `record_id -> spotify_track_id` in `external_mappings`
- Handle unmatched tracks with `unmatched` section in the digest

### YouTube export

Same pattern, using YouTube Data API:

- Search videos per record
- Prefer official uploads or high-view audio versions
- Create playlist and add items

---

## Taste Profile Service

`TasteProfileService`:

- `load(userId): TasteProfile`
- `applyChatSignals(userId, signals)` — called from chat turns
- `applyFeedback(userId, candidate, action)` — updates weights

Weight update rule (simple EMA):

```ts
function bumpWeight(profile, key, delta) {
  const prev = profile[key] ?? 0;
  profile[key] = clamp(prev * 0.9 + delta, -1, 1);
}
```

- `love` on a jazz-rap record: `+0.3` to genre, `+0.2` to artist
- `dismiss`: `-0.2`
- `too_expensive`: raise `priceSensitivity`
- `wrong_vibe`: `-0.3` on top matched descriptor

---

## Chat Integration

Add tools to `CHAT_FUNCTION_TOOLS`:

- `create_discovery_job`
- `update_discovery_job`
- `list_discovery_jobs`
- `trigger_discovery_run`

In `chat.service.ts.executeTool`, route these to `DiscoveryService`. The LLM can then handle natural prompts like:

> "Set up weekly deep house discovery under $40."

and respond with a confirmation + next run time.

Also add a post-run tool:

- `get_latest_digest` — reads the most recent `discovery_runs` + `discovery_candidates` and formats them for the chat.

---

## Configuration

Environment variables (Nest `ConfigService`):

- `DISCOVERY_ENABLED=true|false`
- `DISCOVERY_SCHEDULER_TICK_CRON=*/1 * * * *`
- `DISCOVERY_CONCURRENCY=3`
- `DISCOVERY_MAX_RESULTS_DEFAULT=10`
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`
- `INTEGRATIONS_ENCRYPTION_KEY` (base64, 32 bytes)

---

## Security and Privacy

- All OAuth tokens encrypted with AES-GCM before storage
- Never log tokens
- Rate-limit manual triggers (e.g., 5/min per user)
- RBAC check: user can only read their own jobs/runs/candidates
- If the app is multi-user later: add `userId` guards in controllers

---

## Observability

- Structured logs per run: `jobId`, `runId`, `durationMs`, `poolSize`, `delivered`, `status`
- Metrics:
  - `discovery_runs_total{status}`
  - `discovery_run_duration_ms`
  - `discovery_candidates_delivered`
  - `discovery_playlist_export_success_total`
- Traces around: search, enrichment, delivery, playlist export
- Store last error string on `discovery_runs.error`

---

## Failure Handling

- Tool timeouts reuse existing `TOOL_TIMEOUT_MS` pattern from `chat.service.ts`
- Retry policy per step:
  - retrieval: 2 retries, exponential backoff
  - enrichment: best-effort, continue with partial data
  - delivery: retry up to 3 times; fall back to in-app only if external fails
  - playlist export: mark `partial` status and include unmatched list
- Idempotency ensures reruns don't double-deliver

---

## Step-by-Step Implementation Plan

### Step 1 — Schemas and module scaffolding

- Add `DiscoveryModule`, `TasteProfileModule`, `IntegrationsModule`
- Define Mongoose schemas for `discovery_jobs`, `discovery_runs`, `discovery_candidates`, `taste_profiles`, `seen_records`, `external_accounts`
- Add indexes
- Wire modules into `AppModule`

### Step 2 — CRUD endpoints for jobs

- `DiscoveryController` with create/list/get/update/delete
- DTOs + validation (reuse global `ValidationPipe`)
- Service methods to compute `nextRunAt` from `schedule`

### Step 3 — Scheduler + worker (no external integrations yet)

- `DiscoveryScheduler` using `@nestjs/schedule`
- `DiscoveryWorker.runJob(jobId)` implementing the pipeline
- Use existing `EmbeddingsService` + `RecordsService.semanticSearch`
- Persist `runs` + `candidates`
- Unit-test ranker with fixtures

### Step 4 — Taste profile + feedback

- `TasteProfileService` with load/update/applyFeedback
- Feedback endpoint `POST /discovery/candidates/:id/feedback`
- Ensure chat signals also feed into the profile (hook in `chat.service.ts`)

### Step 5 — In-app digest delivery

- Digest generator with JSON + natural language outputs
- Expose latest digest via endpoint for UI
- Chat tool `get_latest_digest`

### Step 6 — Spotify integration

- OAuth connect/callback
- Token refresh logic
- Track search + playlist create/update
- Wire into digest delivery when `autoPlaylist` is true

### Step 7 — YouTube integration

- Mirror Spotify pattern with YouTube Data API
- Handle per-item failures gracefully

### Step 8 — Chat agent hooks

- Add discovery tools to `CHAT_FUNCTION_TOOLS` + `CHAT_COMPLETION_TOOLS`
- Route calls in `ChatService.executeTool`
- Update `VINYL_EXPERT_INSTRUCTIONS` to explain new capabilities

### Step 9 — Evals

- Add `evals/discovery.sample.jsonl`
- Cases:
  - Job creation from natural language
  - No-duplicate-across-runs
  - Constraint adherence (budget, in-stock only)
  - Diversity (artist/label caps)
  - Feedback adaptation across 3 simulated runs
- Extend `npm run test:eval` to include a `discovery` suite

### Step 10 — Observability + hardening

- Logs, metrics, traces
- Retry policies and partial-success handling
- Rate limits on manual triggers
- Docs in `docs/`:
  - `RecurringDiscoveryAgent.md` (this file)
  - Update `TODO.md`
  - Add a README section on integrations setup

---

## Acceptance Criteria

- A user can create a weekly job via chat that runs automatically and delivers a digest
- Digest contains explanations tied to the user's taste profile
- No record repeats in consecutive runs unless `noveltyTolerance=low`
- Hard constraints (price, in-stock) are never violated in delivered items
- Idempotency prevents duplicate runs on the same bucket
- If Spotify/YouTube export fails, the in-app digest still delivers
- Feedback actions measurably change the next run's ranking
- Eval suite passes at or above configured thresholds

---

## Future Extensions

- Switch in-process scheduler to BullMQ+Redis
- Add collaborative jobs (shared playlist among users)
- Add marketplace expansions (external catalogs, auctions)
- Add "mission mode" (time-bound, multi-run objectives)
- Add audio-snippet-based discovery (see `TasteModel.md` audio search section)
- Add adaptive cadence (more frequent when engagement is high)
