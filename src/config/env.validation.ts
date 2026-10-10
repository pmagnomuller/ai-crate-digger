import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.string().optional(),
  MONGODB_URI: z.string().min(1),
  DISCOGS_USER_TOKEN: z.string().min(1),
  DISCOGS_SEED_TARGET: z.coerce.number().int().positive().default(200),
  AZURE_OPENAI_ENDPOINT: z.string().url(),
  AZURE_OPENAI_API_KEY: z.string().min(1),
  AZURE_OPENAI_API_VERSION: z.string().min(1).default('2024-10-21'),
  /** Query param for `POST /openai/v1/responses` (Foundry / Responses API). Use `v1`, not a date version. */
  AZURE_OPENAI_RESPONSES_API_VERSION: z.string().min(1).default('v1'),
  AZURE_OPENAI_CHAT_DEPLOYMENT: z.string().min(1),
  AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT: z.string().min(1),
  AZURE_OPENAI_TTS_DEPLOYMENT: z.string().min(1),
  /** When TTS is only available on another region/resource, set endpoint (+ optional key / api-version). */
  AZURE_OPENAI_TTS_ENDPOINT: z.string().url().optional(),
  AZURE_OPENAI_TTS_API_KEY: z.string().min(1).optional(),
  AZURE_OPENAI_TTS_API_VERSION: z.string().min(1).optional(),
  /** Spotify OAuth (optional until you use connect-taste flow). */
  SPOTIFY_CLIENT_ID: z.string().min(1).optional(),
  SPOTIFY_CLIENT_SECRET: z.string().min(1).optional(),
  SPOTIFY_REDIRECT_URI: z.string().url().optional(),
  /** Peppers session token hashes. Change in production. */
  SESSION_SECRET: z.string().min(8).default('dev-session-secret-change-me'),
  /** Where Spotify OAuth redirects the browser after callback (Vite client). */
  CLIENT_ORIGIN: z.string().url().default('http://127.0.0.1:5173'),
});

export type AppEnv = z.infer<typeof envSchema>;
