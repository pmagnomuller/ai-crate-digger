import { APIError } from 'openai';
import { lastValueFrom, toArray } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_TTS_VOICE, TTS_MAX_INPUT_CHARS } from '../tts/tts.service';
import { ChatService, shouldFallbackToChatCompletions, type ChatSseEvent } from './chat.service';

jest.mock('../ai/azure-openai.client', () => ({
  createAzureOpenAIClient: jest.fn(),
  createAzureOpenAIResponsesClient: jest.fn(),
}));

import {
  createAzureOpenAIClient,
  createAzureOpenAIResponsesClient,
} from '../ai/azure-openai.client';

describe('shouldFallbackToChatCompletions', () => {
  it('returns true for 404 APIError', () => {
    expect(shouldFallbackToChatCompletions(new APIError(404, undefined, 'Resource not found', undefined))).toBe(
      true,
    );
  });

  it('returns true for incomplete_stream', () => {
    expect(shouldFallbackToChatCompletions(new Error('incomplete_stream'))).toBe(true);
  });

  it('returns true for Azure input validation400', () => {
    expect(
      shouldFallbackToChatCompletions(
        new APIError(400, undefined, `400 'input' is a required property`, undefined),
      ),
    ).toBe(true);
  });

  it('returns true for plain Error with same message (Responses stream error event)', () => {
    expect(shouldFallbackToChatCompletions(new Error(`400 'input' is a required property`))).toBe(true);
  });

  it('returns true when message has extra spaces or typographic quotes', () => {
    expect(shouldFallbackToChatCompletions(new Error(`400  \u2018input\u2019  is  a  required  property`))).toBe(
      true,
    );
  });

  it('returns false for unrelated errors', () => {
    expect(shouldFallbackToChatCompletions(new Error('rate limited'))).toBe(false);
    expect(shouldFallbackToChatCompletions(new APIError(401, undefined, 'Unauthorized', undefined))).toBe(false);
  });
});

describe('ChatService streamRecommendations', () => {
  const mockResponsesCreate = jest.fn();
  const mockResponsesRetrieve = jest.fn();
  const mockChatCompletionsCreate = jest.fn();

  const searchRecordsTool = { run: jest.fn().mockResolvedValue([]) };
  const getRecordDetailTool = { run: jest.fn() };
  const ttsService = { synthesize: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (createAzureOpenAIResponsesClient as jest.Mock).mockReturnValue({
      responses: {
        create: mockResponsesCreate,
        retrieve: mockResponsesRetrieve,
      },
    });
    (createAzureOpenAIClient as jest.Mock).mockReturnValue({
      chat: {
        completions: {
          create: mockChatCompletionsCreate,
        },
      },
    });
  });

  function makeService(): ChatService {
    const config = {
      getOrThrow: (k: string) => {
        if (k === 'azureOpenAI.chatDeployment') return 'test-deployment';
        throw new Error(`unexpected key ${k}`);
      },
    } as unknown as ConfigService;
    return new ChatService(config, searchRecordsTool as never, getRecordDetailTool as never, ttsService as never);
  }

  it('falls back to chat completions when Responses API returns 404', async () => {
    mockResponsesCreate.mockRejectedValue(new APIError(404, undefined, 'Resource not found', undefined));
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'Hello from completions' } }],
    });

    const events: ChatSseEvent[] = await lastValueFrom(
      makeService().streamRecommendations({ prompt: 'hi', includeAudio: false }).pipe(toArray()),
    );

    expect(mockChatCompletionsCreate).toHaveBeenCalled();
    expect(events.some((e) => e.type === 'session_start')).toBe(true);
    expect(events.some((e) => e.type === 'token')).toBe(true);
    const final = events.find((e) => e.type === 'final_answer');
    expect(final?.type === 'final_answer' && final.data.text).toBe('Hello from completions');
  });

  it('falls back when Responses stream ends without a terminal event (incomplete_stream)', async () => {
    mockResponsesCreate.mockRejectedValue(new Error('incomplete_stream'));
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'Recovered' } }],
    });

    const events: ChatSseEvent[] = await lastValueFrom(
      makeService().streamRecommendations({ prompt: 'hi', includeAudio: false }).pipe(toArray()),
    );

    expect(mockChatCompletionsCreate).toHaveBeenCalled();
    const final = events.find((e) => e.type === 'final_answer');
    expect(final?.type === 'final_answer' && final.data.text).toBe('Recovered');
  });

  it('passes voice to TTS when includeAudio is true', async () => {
    mockResponsesCreate.mockRejectedValue(new APIError(404, undefined, 'Resource not found', undefined));
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'Hello' } }],
    });
    ttsService.synthesize.mockResolvedValue({ mimeType: 'audio/mpeg', base64Audio: 'YWI=' });

    await lastValueFrom(
      makeService()
        .streamRecommendations({ prompt: 'hi', includeAudio: true, voice: 'onyx' })
        .pipe(toArray()),
    );

    expect(ttsService.synthesize).toHaveBeenCalledWith('Hello', { voice: 'onyx' });
  });

  it('uses default TTS voice when voice is omitted', async () => {
    mockResponsesCreate.mockRejectedValue(new APIError(404, undefined, 'Resource not found', undefined));
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'Hi' } }],
    });
    ttsService.synthesize.mockResolvedValue({ mimeType: 'audio/mpeg', base64Audio: 'YWI=' });

    await lastValueFrom(
      makeService().streamRecommendations({ prompt: 'hi', includeAudio: true }).pipe(toArray()),
    );

    expect(ttsService.synthesize).toHaveBeenCalledWith('Hi', { voice: DEFAULT_TTS_VOICE });
  });

  it('emits tts_error when TTS fails', async () => {
    mockResponsesCreate.mockRejectedValue(new APIError(404, undefined, 'Resource not found', undefined));
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'Hello' } }],
    });
    ttsService.synthesize.mockRejectedValue(new Error('deployment not found'));

    const events: ChatSseEvent[] = await lastValueFrom(
      makeService().streamRecommendations({ prompt: 'hi', includeAudio: true }).pipe(toArray()),
    );

    const ttsErr = events.find((e) => e.type === 'tts_error');
    expect(ttsErr?.type === 'tts_error' && ttsErr.data.message).toContain('deployment');
    const final = events.find((e) => e.type === 'final_answer');
    expect(final?.type === 'final_answer' && final.data.audio).toBeUndefined();
  });

  it('truncates long answers for TTS and emits tts_truncated', async () => {
    const long = 'x'.repeat(TTS_MAX_INPUT_CHARS + 500);
    mockResponsesCreate.mockRejectedValue(new APIError(404, undefined, 'Resource not found', undefined));
    mockChatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: long } }],
    });
    ttsService.synthesize.mockResolvedValue({ mimeType: 'audio/mpeg', base64Audio: 'YWI=' });

    const events: ChatSseEvent[] = await lastValueFrom(
      makeService().streamRecommendations({ prompt: 'hi', includeAudio: true }).pipe(toArray()),
    );

    const trunc = events.find((e) => e.type === 'tts_truncated');
    expect(trunc?.type === 'tts_truncated' && trunc.data.originalChars).toBe(long.length);
    expect(ttsService.synthesize).toHaveBeenCalledWith('x'.repeat(TTS_MAX_INPUT_CHARS), {
      voice: DEFAULT_TTS_VOICE,
    });
  });
});
