import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import type { FunctionTool } from 'openai/resources/responses/responses';

export const VINYL_EXPERT_INSTRUCTIONS = `You are a vinyl record expert and curator. You help users discover records that match their taste, mood, vibe, genre, budget, and listening context.
You have access to tools to search a catalog and fetch full details for specific records. Prefer calling tools when you need concrete catalog data, then synthesize a short, helpful recommendation.
Be concise unless the user asks for depth. Mention artist, title, label, and why each pick fits when relevant.`;

export const CHAT_FUNCTION_TOOLS: FunctionTool[] = [
  {
    type: 'function',
    name: 'search_records',
    strict: true,
    description:
      'Semantic search over the vinyl catalog. Use query for the user intent; optional genre and vibe refine the embedding.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: 'What the user wants (styles, era, artists, mood).' },
        genre: {
          type: ['string', 'null'],
          description: 'Optional genre filter (e.g. jazz, house). Pass null if unused.',
        },
        vibe: {
          type: ['string', 'null'],
          description: 'Optional vibe/mood (e.g. late night, energetic). Pass null if unused.',
        },
      },
      // Strict mode requires every property key to appear in `required`;
      // nullable types above express "optional".
      required: ['query', 'genre', 'vibe'],
    },
  },
  {
    type: 'function',
    name: 'get_record_detail',
    strict: true,
    description:
      'Fetch full details for one catalog record by MongoDB _id (use ids from search_records results).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', description: 'Record id from search results (_id as string).' },
      },
      required: ['id'],
    },
  },
];

/** Same tools for Chat Completions (Azure when `/openai/v1/responses` is unavailable). */
export const CHAT_COMPLETION_TOOLS: ChatCompletionTool[] = CHAT_FUNCTION_TOOLS.map((t) => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description ?? undefined,
    parameters: t.parameters ?? undefined,
  },
}));
