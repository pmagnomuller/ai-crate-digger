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

## Evaluation and Testing

- [ ] Expand eval set with ambiguous and adversarial prompts
- [ ] Add constraint adherence checks (budget, stock, region, format)
- [ ] Add failure-mode evals (timeouts, partial data, no results)
- [ ] Add multi-turn continuity evals
- [ ] Define pass/fail thresholds for quality and reliability metrics

## Nice to Have

- [ ] Add compare mode for side-by-side record recommendations
- [ ] Add session modes (strict budget, in-stock only, rare pressings)
- [ ] Add caching for frequent record search/detail requests
- [ ] Add user-facing rationale text for why each recommendation matches
