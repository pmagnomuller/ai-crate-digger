import { ConfigService } from '@nestjs/config';
import { createAzureOpenAIClientForTts } from '../ai/azure-openai.client';
import { DEFAULT_TTS_VOICE, TtsService } from './tts.service';

jest.mock('../ai/azure-openai.client', () => ({
  createAzureOpenAIClientForTts: jest.fn(),
}));

describe('TtsService', () => {
  const mockSpeechCreate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (createAzureOpenAIClientForTts as jest.Mock).mockReturnValue({
      audio: {
        speech: {
          create: mockSpeechCreate,
        },
      },
    });
  });

  function makeService(): TtsService {
    const config = {
      getOrThrow: (k: string) => {
        if (k === 'azureOpenAI.ttsDeployment') return 'test-tts';
        throw new Error(`unexpected key ${k}`);
      },
    } as unknown as ConfigService;
    return new TtsService(config);
  }

  it('synthesize uses nova by default and returns base64 mp3', async () => {
    const buf = Buffer.from([0xff, 0xfb]);
    mockSpeechCreate.mockResolvedValue({
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    });

    const out = await makeService().synthesize('hello');

    expect(mockSpeechCreate).toHaveBeenCalledWith({
      model: 'test-tts',
      voice: DEFAULT_TTS_VOICE,
      input: 'hello',
      response_format: 'mp3',
    });
    expect(out.mimeType).toBe('audio/mpeg');
    expect(out.base64Audio).toBe(buf.toString('base64'));
  });

  it('synthesize passes onyx when requested', async () => {
    mockSpeechCreate.mockResolvedValue({
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    await makeService().synthesize('hi', { voice: 'onyx' });

    expect(mockSpeechCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: 'onyx',
      }),
    );
  });

  it('synthesizeStream returns a readable and default voice', async () => {
    const webStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    mockSpeechCreate.mockResolvedValue({
      body: webStream,
    });

    const { stream, mimeType } = await makeService().synthesizeStream('hello');

    expect(mimeType).toBe('audio/mpeg');
    expect(mockSpeechCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: DEFAULT_TTS_VOICE,
        input: 'hello',
      }),
    );

    const chunks: Buffer[] = [];
    for await (const c of stream) {
      chunks.push(c as Buffer);
    }
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 2, 3]));
  });
});
