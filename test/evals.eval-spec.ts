import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type RetrievalCase = {
  name: string;
  query: string;
  genres?: string[];
  label?: string;
  limit?: number;
  mustContainIds?: string[];
  expectAnyGenres?: string[];
  expectLabelIncludes?: string;
};

type ChatCase = {
  name: string;
  prompt: string;
  maxResults?: number;
  maxToolRounds?: number;
  mustCallSearchRecords?: boolean;
};

type SseEvent = { type: string; data: unknown };

const BASE_URL = process.env.EVAL_BASE_URL ?? 'http://localhost:3000';
const RETRIEVAL_FILE =
  process.env.EVAL_RETRIEVAL_FILE ?? resolve(process.cwd(), 'evals/retrieval.sample.jsonl');
const CHAT_FILE = process.env.EVAL_CHAT_FILE ?? resolve(process.cwd(), 'evals/chat.sample.jsonl');

const HIT_AT_K_THRESHOLD = Number(process.env.EVAL_HIT_AT_K_THRESHOLD ?? '0.75');
const GROUNDED_TOOL_USAGE_THRESHOLD = Number(process.env.EVAL_TOOL_USAGE_THRESHOLD ?? '0.9');

function readJsonl<T>(filePath: string): T[] {
  const raw = readFileSync(filePath, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase();
}

function parseSsePayload(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice('data: '.length);
    try {
      events.push(JSON.parse(payload) as SseEvent);
    } catch {
      // Ignore malformed chunks and keep parsing.
    }
  }
  return events;
}

describe('Eval harness (live API)', () => {
  jest.setTimeout(60_000);

  it('retrieval evals meet hit@k threshold', async () => {
    const cases = readJsonl<RetrievalCase>(RETRIEVAL_FILE);
    expect(cases.length).toBeGreaterThan(0);

    let hits = 0;
    for (const c of cases) {
      const res = await postJson('/records/search', {
        query: c.query,
        genres: c.genres,
        label: c.label,
        limit: c.limit ?? 6,
      });
      expect(res.status).toBe(201);
      const rows = (await res.json()) as Array<{
        _id?: string;
        genre?: string[];
        label?: string;
        similarity?: number;
      }>;

      const hasExpectedId =
        c.mustContainIds?.length && rows.some((r) => c.mustContainIds?.includes(String(r._id)));
      const hasExpectedGenre =
        c.expectAnyGenres?.length &&
        rows.some((r) =>
          (r.genre ?? []).some((g) =>
            c.expectAnyGenres?.map((x) => normalize(x)).includes(normalize(g)),
          ),
        );
      const hasExpectedLabel =
        c.expectLabelIncludes &&
        rows.some((r) => normalize(r.label).includes(normalize(c.expectLabelIncludes)));

      const passed =
        Boolean(hasExpectedId) || Boolean(hasExpectedGenre) || Boolean(hasExpectedLabel);

      if (passed) hits += 1;
    }

    const hitAtK = hits / cases.length;
    expect(hitAtK).toBeGreaterThanOrEqual(HIT_AT_K_THRESHOLD);
  });

  it('chat evals call retrieval tool as expected', async () => {
    const cases = readJsonl<ChatCase>(CHAT_FILE);
    expect(cases.length).toBeGreaterThan(0);

    let toolUsagePasses = 0;

    for (const c of cases) {
      const res = await postJson('/chat/stream', {
        prompt: c.prompt,
        includeAudio: false,
        maxResults: c.maxResults ?? 6,
        maxToolRounds: c.maxToolRounds ?? 5,
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      const events = parseSsePayload(text);

      const toolCalls = events.filter((e) => e.type === 'tool_call');
      const calledSearch = toolCalls.some((e) => {
        const data = e.data as { toolName?: string };
        return data.toolName === 'search_records';
      });

      const sawFinalAnswer = events.some((e) => e.type === 'final_answer');
      expect(sawFinalAnswer).toBe(true);

      const passed = c.mustCallSearchRecords ? calledSearch : true;
      if (passed) toolUsagePasses += 1;
    }

    const toolUsageRate = toolUsagePasses / cases.length;
    expect(toolUsageRate).toBeGreaterThanOrEqual(GROUNDED_TOOL_USAGE_THRESHOLD);
  });
});
