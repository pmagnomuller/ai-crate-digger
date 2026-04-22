# Taste Model and Audio Semantic Search Spec

## Goal

Enable the chat assistant to understand ambiguous music language and map user intent to records by combining:

- Taste-profile modeling from conversation
- Sonic metadata on records
- Optional audio snippet retrieval ("find me things that sound like this")

## Why this matters

Music lovers often describe sound with metaphor ("dusty", "late-night", "wet drums", "floaty"). A metadata-only search system misses this intent. The assistant should translate this language into structured preferences and retrieval constraints.

## Scope

This spec covers:

- Taste profile fields and extraction strategy
- Prompt behavior for ambiguity and follow-up questions
- Metadata requirements for records
- Audio semantic search feasibility and MVP architecture
- Evaluation strategy for taste understanding and snippet relevance

## Taste Profile Schema (session-level MVP)

Use a lightweight object updated each turn.

```json
{
  "genres": ["jazz rap", "deep house"],
  "antiGenres": ["big room EDM"],
  "moods": ["moody", "hypnotic", "warm"],
  "sonicDescriptors": ["dusty drums", "saturated bass", "wide reverb"],
  "energyLevel": 4,
  "tempoPreference": "slow-mid",
  "vocalPreference": "instrumental_or_sparse",
  "referenceArtists": ["Madlib", "Theo Parrish"],
  "antiReferences": ["modern chart pop"],
  "contextTags": ["late-night", "headphones"],
  "noveltyTolerance": "medium",
  "priceSensitivity": "medium"
}
```

## Ambiguous Language Mapping

Create a mapping layer that converts fuzzy descriptors into ranked retrieval hints.

Examples:

- "dusty" -> lo-fi texture, saturated mids, vinyl/noise aesthetic
- "warm" -> lower brightness, fuller low-mid response
- "driving" -> higher energy, steady rhythm, forward groove
- "spacey" -> atmospheric pads, longer reverb, lower vocal density
- "head-nod" -> mid tempo, prominent kick/snare pocket, groove focus

Important: treat mappings as soft constraints (weights), not hard filters.

## Conversation Policy

When user intent is vague, ask one targeted question before retrieving:

- "Do you want more groove or more atmosphere?"
- "Should this be vocal-forward or mostly instrumental?"
- "Do you want this closer to house tempo or hip-hop tempo?"

After recommendations, ask for corrective feedback:

- "Too mellow, too busy, or close?"

Persist the response as taste-delta updates.

## Recommendation Output Contract

Each recommendation should include:

- Match reasons tied to profile signals
- Simple sound description in natural language
- Optional contrast statement vs user references
- One follow-up axis to refine next turn (darker/brighter, slower/faster, denser/sparser)

## Record Metadata Requirements

Minimum additional fields for taste-driven retrieval:

- `mood_tags` (string[])
- `sonic_descriptors` (string[])
- `rhythm_profile` (enum or string[])
- `energy_level` (1-10)
- `tempo_bucket` (slow, slow-mid, mid, mid-fast, fast)
- `vocal_presence` (instrumental, sparse, vocal-forward)
- `similar_artists` (string[])
- `adjacent_genres` (string[])

Optional but useful:

- `listening_context_tags` (late-night, warm-up set, deep focus, peak-time)
- `recording_texture` (clean, raw, dusty, tape-like)

## Can we do semantic search from sound?

Yes, with an embedding pipeline.

High-level approach:

1. Convert user snippet and record audio previews into vector embeddings
2. Store vectors in a vector index
3. Retrieve nearest neighbors by cosine similarity
4. Re-rank with metadata and taste-profile constraints

This is a standard "query-by-audio-example" pattern.

## Audio Search MVP Architecture

### Inputs

- User-provided snippet upload (10-30 seconds)
- Optional voice note describing desired vibe

### Processing

- Normalize audio (sample rate, loudness)
- Generate embedding using an audio embedding model
- Save embedding and link to session/user

### Retrieval

- Vector similarity against record preview embeddings
- Hybrid scoring:
  - `0.60 * audio_similarity`
  - `0.25 * taste_profile_match`
  - `0.15 * metadata_constraints` (price/stock/format)

### Output

- Top matches with confidence bands
- Explain match by sonic attributes, not only genre labels
- If low-confidence: return "closest vibe" and ask one clarifying question

## Data and Ops Considerations

- Keep record preview embeddings precomputed (offline batch + incremental updates)
- Track `embedding_model_version` for re-index safety
- Add `last_verified_at` for dynamic fields (price/stock)
- Add retention and consent policy for user-uploaded audio

## Evaluation Plan

Add evals in 3 groups:

1. Ambiguous language interpretation
   - Metaphor-heavy prompts ("smoky", "liquid", "wide", "gritty")
2. Multi-turn adaptation
   - User correction after first recommendations
3. Audio snippet relevance
   - Human-rated top-k relevance from snippet to recommended records

Suggested initial thresholds:

- Taste intent accuracy (manual rubric): >= 80%
- Multi-turn correction success (within 2 turns): >= 75%
- Audio top-5 relevance (human accepted at least one): >= 70%

## Implementation Sequence

1. Add taste-profile extraction and memory in chat service
2. Add new sonic metadata fields and backfill high-traffic records
3. Update prompts and response contract for ambiguity handling
4. Introduce audio upload endpoint and embedding worker
5. Add vector index retrieval and hybrid ranking
6. Add eval cases and raise thresholds gradually

## Risks

- Overfitting to genre labels instead of sound texture
- Sparse/low-quality metadata causing weak reranking
- User snippets with poor signal (noise, speech over music)

Mitigations:

- Use confidence and fallback questions
- Keep constraints soft and rerank rather than hard filter
- Allow user to provide both snippet and text intent
