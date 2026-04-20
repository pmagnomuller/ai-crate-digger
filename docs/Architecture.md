# Architecture

AI Crate Digger is a **NestJS** backend with a small **Vite** front end for local development. The product goal is chat-style recommendations over a **MongoDB** catalog of records, grounded by **tool calls** into real rows instead of free-form guesses.

## High-level layout

- **`AppModule`** wires global configuration, MongoDB, and feature modules: `RecordsModule`, `SeedModule`, `AiModule`, `ChatModule`, `TtsModule`.
- **`RecordsModule`** owns the `RecordEntity` Mongoose schema (`records` collection), semantic search over stored embeddings, and legacy HTTP helpers (price / availability) used by demos or enrichment flows.
- **`AiModule`** (with **`EmbeddingsModule`**) talks to **Azure OpenAI**: chat completions for the assistant, embeddings for catalog and query vectors.
- **`ChatModule`** exposes **`POST /chat/stream`** as **Server-Sent Events (SSE)**. The service drives a vinyl-focused system prompt, lets the model call tools (`search_records`, `get_record_detail`), and streams tokens plus structured events (`tool_call`, `tool_result`, `final_answer`, etc.).
- **`TtsModule`** synthesizes optional speech for the final answer; **`POST /chat/speak`** returns raw audio for clients that want TTS outside the stream.

Configuration is loaded through **`@nestjs/config`** with a Zod-validated env schema (`src/config/`), so required keys fail fast at boot.

## Data flow (recommendations)

1. **Ingestion** — `npm run seed:discogs` runs `src/seed/discogs.seed.ts`, which paginates Discogs, maps releases into `RecordEntity`, and (unless skipped) writes **embedding vectors** next to each document for later similarity search.
2. **Chat** — The user prompt and optional history go to the chat deployment. When the model calls `search_records`, the app embeds the query (or uses the tool arguments as designed), runs vector similarity against MongoDB, and returns ranked records. `get_record_detail` loads a single document for grounding.
3. **Response** — Text streams over SSE; when enabled, a TTS pass can attach audio metadata or audio on `final_answer` depending on client options.

## Client

The **`client/`** tree is a Vite app (`npm run dev:client`) that talks to the API during development. It is not required to run the backend.

## Design choices

- **Tools + SSE** keeps the UX responsive while allowing multiple retrieval rounds before a final narrative answer.
- **Embeddings at seed time** amortize cost; runtime embeddings are used for query vectors as needed.
- **MongoDB** holds both catalog fields and embedding arrays on the same document for simple deployment and querying.

## Semantic search

Recommendations are grounded in **semantic search**: query and catalog text are turned into **embeddings**, then ranked by **vector similarity** (dot product in an aggregation pipeline), not only keyword match. For a concise explanation of the concept and how it maps to this codebase, see **[SemanticSearch.md](./SemanticSearch.md)**.
