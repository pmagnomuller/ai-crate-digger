import { ConfigService } from '@nestjs/config';
import OpenAI, { AzureOpenAI } from 'openai';

/**
 * Azure's portal sometimes surfaces per-deployment URLs like
 * `https://{resource}.openai.azure.com/openai/deployments/{model}/embeddings?api-version=...`.
 * The OpenAI SDK expects the bare resource URL (it appends `/openai/deployments/...` itself).
 * Strip any trailing path, query, or fragment so misconfigured env vars still work.
 */
/**
 * Azure text-to-speech (`/audio/speech`) for models like `gpt-4o-mini-tts` is often only exposed on
 * preview `api-version` values; `2024-10-21` frequently returns 404 for speech on Foundry resources.
 * Override with `AZURE_OPENAI_TTS_API_VERSION` if your resource requires a different version.
 */
export const DEFAULT_AZURE_TTS_API_VERSION = '2025-01-01-preview';

function normalizeAzureEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    return endpoint.replace(/\/+$/, '');
  }
}

/**
 * Azure OpenAI client for deployment-scoped routes (embeddings, speech, chat completions, etc.).
 * Rewrites paths to `/deployments/{model}/...` where required by the Azure API.
 */
export const createAzureOpenAIClient = (configService: ConfigService): AzureOpenAI => {
  const endpoint = normalizeAzureEndpoint(configService.getOrThrow<string>('azureOpenAI.endpoint'));
  const apiVersion = configService.getOrThrow<string>('azureOpenAI.apiVersion');
  const apiKey = configService.getOrThrow<string>('azureOpenAI.apiKey');
  return new AzureOpenAI({ endpoint, apiKey, apiVersion });
};

/**
 * Optional separate Azure resource/region for speech (e.g. TTS only in Sweden Central while chat is in East US).
 * Endpoint and key fall back to the main OpenAI resource when TTS-specific env vars are unset.
 * API version defaults to {@link DEFAULT_AZURE_TTS_API_VERSION} unless `AZURE_OPENAI_TTS_API_VERSION` is set.
 */
export const createAzureOpenAIClientForTts = (configService: ConfigService): AzureOpenAI => {
  const mainEndpoint = configService.getOrThrow<string>('azureOpenAI.endpoint');
  const ttsEndpoint = configService.get<string>('azureOpenAI.ttsEndpoint');
  const endpoint = normalizeAzureEndpoint(ttsEndpoint ?? mainEndpoint);
  const apiVersion =
    configService.get<string>('azureOpenAI.ttsApiVersion') ?? DEFAULT_AZURE_TTS_API_VERSION;
  const apiKey =
    configService.get<string>('azureOpenAI.ttsApiKey') ??
    configService.getOrThrow<string>('azureOpenAI.apiKey');
  return new AzureOpenAI({ endpoint, apiKey, apiVersion });
};

/**
 * OpenAI-compatible `/openai/v1` base URL for the Responses API (not deployment-prefixed in the SDK).
 * @see https://learn.microsoft.com/azure/ai-foundry/openai/how-to/responses
 */
export const createAzureOpenAIResponsesClient = (configService: ConfigService): OpenAI => {
  const endpoint = normalizeAzureEndpoint(configService.getOrThrow<string>('azureOpenAI.endpoint'));
  const responsesApiVersion = configService.getOrThrow<string>('azureOpenAI.responsesApiVersion');
  const apiKey = configService.getOrThrow<string>('azureOpenAI.apiKey');
  return new OpenAI({
    apiKey,
    baseURL: `${endpoint}/openai/v1`,
    defaultQuery: { 'api-version': responsesApiVersion },
    defaultHeaders: { 'api-key': apiKey },
  });
};
