# Semantic search in AI Crate Digger

## What semantic search is

**Semantic search** finds items by **meaning**, not only by matching the same words. A user might ask for “warm sunset vibes” while catalog text says “deep house” or lists artist and title—there is no literal keyword overlap, but the ideas can still be related.

In practice, semantic search usually means:

1. Turn text into a **fixed-length vector** (an **embedding**) using a model trained so that similar meanings land in similar regions of that vector space.
2. **Compare** the query vector to each item’s stored vector and **rank** by how “close” they are.

That is different from **keyword** or **full-text** search, which looks for substrings or token matches. Both have a place; this app uses embeddings for fuzzy intent over structured catalog fields.

## How this project uses it

| Stage | What happens |
|--------|----------------|
| **Seed** | For each record (unless `DISCOGS_SKIP_EMBEDDINGS=true`), Azure OpenAI embeds a string built from artist, title, genre, and label. The resulting `number[]` is stored on the document as `embedding`. |
| **Query** | When you call `POST /records/search` or the chat tool `search_records`, the app embeds the search text (chat may blend `query`, `vibe`, and `genre` hints). |
| **Rank** | `RecordsService.semanticSearch()` runs a MongoDB aggregation: optional filters (e.g. genre, label), keep only documents with a non-empty `embedding`, compute a **dot product** between the query vector and each document’s vector, sort by that score descending, and return the top rows. Responses include a **`similarity`** field and omit the raw `embedding` array. |

So: **one shared pipeline** backs HTTP search and chat retrieval. The LLM does not invent catalog rows; it reasons over rows returned by this similarity step (a RAG-like **retrieve, then generate** pattern). See **[Architecture.md](./Architecture.md)** for module layout and **[APP-AND-INTERVIEW-GUIDE.md](./APP-AND-INTERVIEW-GUIDE.md)** §3 for more interview-oriented detail.

## Why the score is a dot product

The **dot product** of two vectors of the same length multiplies them component-wise and sums the products:  
\(a \cdot b = a_1 b_1 + a_2 b_2 + \cdots + a_n b_n\).

For embedding vectors, a higher dot product generally means the vectors point in more **similar directions**, which correlates with more similar meaning. If vectors are **L2-normalized** (unit length), dot product equals **cosine similarity**; otherwise it is still a usable similarity score for ranking.

The implementation computes that sum in MongoDB with `$reduce` over embedding dimensions—see `src/records/records.service.ts`.

## What we are not using (by design)

Ranking is done with a **per-document aggregation** over stored arrays, not MongoDB **Atlas Vector Search** (`$vectorSearch`) or another ANN index. For the catalog sizes this project targets, that keeps deployment simple; at very large scale, teams often add a dedicated vector index for approximate nearest-neighbor search.

## Code entry points

- `src/ai/embeddings.service.ts` — calls Azure to embed text.
- `src/records/records.service.ts` — `search()` (HTTP) and `semanticSearch()` (aggregation).
- `src/ai/tools/search-records.tool.ts` — chat tool wrapping the same `semanticSearch`.
- `src/seed/discogs.seed.ts` — writes per-record embeddings when not skipped.
