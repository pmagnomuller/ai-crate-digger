# Chatbot Improvement TODOs

## High Priority

- [ ] Define a response contract (answer, confidence, evidence, fallback)
- [ ] Add strict schema validation for all tool outputs
- [ ] Implement retry logic for transient tool failures and timeouts
- [ ] Add graceful fallback responses for partial or empty tool results
- [ ] Add telemetry for tool latency, error rates, and empty-result rates

## Retrieval and Ranking

- [ ] Improve search ranking with metadata-aware scoring
- [ ] Add typo tolerance and "did you mean?" suggestions
- [ ] Add broader fallback query when initial search returns no results
- [ ] Add filters for budget, format, availability, and genre

## Conversation Quality

- [ ] Add a clarifying-question policy for ambiguous user requests
- [ ] Add response templates for recommendations and comparisons
- [ ] Add lightweight user preference memory (budget, genre, format)
- [ ] Ensure follow-up turns reuse prior context consistently
- [ ] Add a taste-profile extractor (mood, texture, groove, energy, vocal preference)
- [ ] Add support for ambiguous language ("dusty", "spacey", "warm", "heady", "driving")
- [ ] Add anti-preference capture ("less like X", "no harsh highs", "not too busy")
- [ ] Add "taste delta" feedback loop from user reactions ("too mellow", "more punch")

## Audio Snippet Search

- [ ] Add upload endpoint for short audio snippets (10-30s) and voice notes
- [ ] Build embedding pipeline for audio snippets and record previews
- [ ] Store audio embeddings in vector index for nearest-neighbor retrieval
- [ ] Add hybrid ranking: audio similarity + metadata/taste-profile constraints
- [ ] Add consent and storage policy for user-uploaded audio
- [ ] Add fallback when no close audio match is found ("closest vibe" suggestions)

## Data Model and Metadata

- [ ] Add sonic fields: mood tags, sonic descriptors, rhythm profile, energy level
- [ ] Add tempo bucket and vocal presence fields for recommendation control
- [ ] Add similarity links ("sounds like", influence tags, adjacent genres)
- [ ] Add quality score per record and prioritize enrichment of low-score entries

## Evaluation and Testing

- [ ] Expand eval set with ambiguous and adversarial prompts
- [ ] Add constraint adherence checks (budget, stock, region, format)
- [ ] Add failure-mode evals (timeouts, partial data, no results)
- [ ] Add multi-turn continuity evals
- [ ] Define pass/fail thresholds for quality and reliability metrics
- [ ] Add taste-understanding evals for metaphor-heavy user prompts
- [ ] Add audio-to-record relevance evals for snippet-based retrieval
- [ ] Add adaptation evals across turns after user corrective feedback

## Nice to Have

- [ ] Add compare mode for side-by-side record recommendations
- [ ] Add session modes (strict budget, in-stock only, rare pressings)
- [ ] Add caching for frequent record search/detail requests
- [ ] Add user-facing rationale text for why each recommendation matches

## Agentic Features and Integrations

- [ ] Add Spotify OAuth integration and playlist create/update tools
- [ ] Add YouTube OAuth integration and playlist create/update tools
- [ ] Add a "turn recommendations into playlist" action in chat
- [ ] Support playlist constraints (BPM arc, mood arc, era/genre blend, max duration)
- [ ] Add "crate-to-set" mode that builds a DJ-ready warmup-to-peak sequence
- [ ] Add daily/weekly discovery agent ("bring me 10 new deep cuts under $40")
- [ ] Add watchlist agent with alerts for price drops, restocks, and rare finds
- [ ] Add cross-platform export agent (Spotify, YouTube, CSV, shareable text)
- [ ] Add "sound-like" agent that expands from seed tracks/artists/snippets
- [ ] Add collaborative session mode for group curation and voting
- [ ] Add "digging missions" with autonomous follow-ups and recap summaries
- [ ] Add auto-generated liner notes for each playlist (vibe, transitions, key tracks)
