# Evals

This repo includes a lightweight live-eval harness that calls the running API and checks:

- Retrieval quality on `POST /records/search`
- Tool-usage behavior on `POST /chat/stream`

## Run

1. Start dependencies and API (`docker compose up -d`, then `npm run start:dev`).
2. Run:

```bash
npm run test:eval
```

Defaults:

- Base URL: `http://localhost:3000`
- Retrieval dataset: `evals/retrieval.sample.jsonl`
- Chat dataset: `evals/chat.sample.jsonl`

## Dataset format

`evals/retrieval.sample.jsonl` supports:

- `name` (string)
- `query` (string)
- `genres` (string[])
- `label` (string)
- `limit` (number)
- `mustContainIds` (string[])
- `expectAnyGenres` (string[])
- `expectLabelIncludes` (string)

Each case passes if any expectation is met (ID match, genre match, or label contains text).

`evals/chat.sample.jsonl` supports:

- `name` (string)
- `prompt` (string)
- `maxResults` (number)
- `maxToolRounds` (number)
- `mustCallSearchRecords` (boolean)

Each case requires a `final_answer`, and optionally requires `search_records` tool usage.

## Environment variables

- `EVAL_BASE_URL` (default `http://localhost:3000`)
- `EVAL_RETRIEVAL_FILE` (path to JSONL file)
- `EVAL_CHAT_FILE` (path to JSONL file)
- `EVAL_HIT_AT_K_THRESHOLD` (default `0.75`)
- `EVAL_TOOL_USAGE_THRESHOLD` (default `0.9`)

Example:

```bash
EVAL_BASE_URL=http://localhost:3000 \
EVAL_HIT_AT_K_THRESHOLD=0.8 \
npm run test:eval
```

## Notes

- This harness is intentionally simple and meant for quick regressions.
- For stronger quality gates, add curated `mustContainIds` cases from your catalog and tighten thresholds over time.
