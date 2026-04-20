import type { ConfigService } from '@nestjs/config';
import {
  createAzureOpenAIClient,
  createAzureOpenAIClientForTts,
  createAzureOpenAIResponsesClient,
  DEFAULT_AZURE_TTS_API_VERSION,
} from './azure-openai.client';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (k: string) => values[k],
    getOrThrow: (k: string) => {
      const v = values[k];
      if (v === undefined) throw new Error(`missing ${k}`);
      return v;
    },
  } as unknown as ConfigService;
}

describe('azure-openai.client endpoint normalization', () => {
  it('accepts a bare resource URL', () => {
    const client = createAzureOpenAIClient(
      makeConfig({
        'azureOpenAI.endpoint': 'https://example.openai.azure.com',
        'azureOpenAI.apiVersion': '2024-10-21',
        'azureOpenAI.apiKey': 'k',
      }),
    );
    expect(client.baseURL).toContain('example.openai.azure.com');
  });

  it('strips extra path/query from a mis-pasted deployment URL', () => {
    const client = createAzureOpenAIClient(
      makeConfig({
        'azureOpenAI.endpoint':
          'https://example.openai.azure.com/openai/deployments/foo/embeddings?api-version=2023-05-15',
        'azureOpenAI.apiVersion': '2024-10-21',
        'azureOpenAI.apiKey': 'k',
      }),
    );
    expect(client.baseURL).not.toMatch(/deployments\/foo/);
    expect(client.baseURL).toContain('example.openai.azure.com');
  });

  it('builds a /openai/v1 responses base URL from the resource root', () => {
    const client = createAzureOpenAIResponsesClient(
      makeConfig({
        'azureOpenAI.endpoint':
          'https://example.openai.azure.com/openai/deployments/foo/embeddings?api-version=2023-05-15',
        'azureOpenAI.responsesApiVersion': 'v1',
        'azureOpenAI.apiKey': 'k',
      }),
    );
    expect(client.baseURL).toBe('https://example.openai.azure.com/openai/v1');
  });

  it('createAzureOpenAIClientForTts uses dedicated endpoint when set', () => {
    const client = createAzureOpenAIClientForTts(
      makeConfig({
        'azureOpenAI.endpoint': 'https://east.openai.azure.com',
        'azureOpenAI.apiVersion': '2024-10-21',
        'azureOpenAI.apiKey': 'main-key',
        'azureOpenAI.ttsEndpoint': 'https://sweden.openai.azure.com',
        'azureOpenAI.ttsApiKey': 'tts-key',
      }),
    );
    expect(client.baseURL).toContain('sweden.openai.azure.com');
    expect(client.apiVersion).toBe(DEFAULT_AZURE_TTS_API_VERSION);
  });

  it('createAzureOpenAIClientForTts falls back to main endpoint when TTS env omitted', () => {
    const client = createAzureOpenAIClientForTts(
      makeConfig({
        'azureOpenAI.endpoint': 'https://east.openai.azure.com',
        'azureOpenAI.apiVersion': '2024-10-21',
        'azureOpenAI.apiKey': 'main-key',
      }),
    );
    expect(client.baseURL).toContain('east.openai.azure.com');
    expect(client.apiVersion).toBe(DEFAULT_AZURE_TTS_API_VERSION);
  });

  it('createAzureOpenAIClientForTts honors AZURE_OPENAI_TTS_API_VERSION', () => {
    const client = createAzureOpenAIClientForTts(
      makeConfig({
        'azureOpenAI.endpoint': 'https://east.openai.azure.com',
        'azureOpenAI.apiVersion': '2024-10-21',
        'azureOpenAI.apiKey': 'main-key',
        'azureOpenAI.ttsApiVersion': '2024-10-21',
      }),
    );
    expect(client.apiVersion).toBe('2024-10-21');
  });
});
