import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { APIError, AzureOpenAI } from 'openai';
import type { SpeechCreateParams } from 'openai/resources/audio/speech';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { createAzureOpenAIClientForTts } from '../ai/azure-openai.client';

export const TTS_VOICES = ['onyx', 'nova'] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];
export const DEFAULT_TTS_VOICE: TtsVoice = 'nova';

/** OpenAI / Azure speech `input` max length (chars). */
export const TTS_MAX_INPUT_CHARS = 4096;

function clipTtsInput(text: string): string {
  if (text.length <= TTS_MAX_INPUT_CHARS) return text;
  return text.slice(0, TTS_MAX_INPUT_CHARS);
}

export type TtsResponseFormat = NonNullable<SpeechCreateParams['response_format']>;

export type TtsSynthesizeOptions = {
  voice?: TtsVoice;
  response_format?: TtsResponseFormat;
};

function mimeForFormat(format: TtsResponseFormat): string {
  switch (format) {
    case 'mp3':
      return 'audio/mpeg';
    case 'opus':
      return 'audio/opus';
    case 'aac':
      return 'audio/aac';
    case 'flac':
      return 'audio/flac';
    case 'wav':
      return 'audio/wav';
    case 'pcm':
      return 'audio/pcm';
    default:
      return 'application/octet-stream';
  }
}

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.client = createAzureOpenAIClientForTts(configService);
    this.model = this.configService.getOrThrow<string>('azureOpenAI.ttsDeployment');
  }

  private ttsDebugContext(): string {
    const c = this.client as AzureOpenAI;
    return `baseURL=${c.baseURL} deployment=${this.model} api-version=${c.apiVersion}`;
  }

  private logTtsFailureHint(err: unknown): void {
    const c = this.client as AzureOpenAI;
    const base = c.baseURL ?? '';
    const notFound =
      (err instanceof APIError && err.status === 404) ||
      (err instanceof Error && /\b404\b/i.test(err.message));
    if (!notFound) return;
    if (base.includes('cognitiveservices.azure.com')) {
      this.logger.warn(
        'TTS uses the Azure OpenAI REST path /openai/deployments/{deployment}/audio/speech. ' +
          'Azure AI Speech “Neural TTS” (host like *.tts.speech.microsoft.com) is a different product and is not what this app calls. ' +
          'Deploy an OpenAI TTS model (e.g. gpt-4o-mini-tts) on an Azure OpenAI–compatible resource and set AZURE_OPENAI_TTS_ENDPOINT to that resource’s OpenAI endpoint (often https://{name}.openai.azure.com), not only the Speech resource endpoint.',
      );
    }
  }

  async synthesize(
    text: string,
    options?: TtsSynthesizeOptions,
  ): Promise<{ mimeType: string; base64Audio: string }> {
    const voice = options?.voice ?? DEFAULT_TTS_VOICE;
    const response_format = options?.response_format ?? 'mp3';
    const input = clipTtsInput(text);
    try {
      const response = await this.client.audio.speech.create({
        model: this.model,
        voice,
        input,
        response_format,
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        mimeType: mimeForFormat(response_format),
        base64Audio: buffer.toString('base64'),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`TTS failed (${this.ttsDebugContext()}): ${msg}`);
      this.logTtsFailureHint(err);
      throw err;
    }
  }

  /**
   * Streams raw audio bytes from the TTS API (suitable for NestJS StreamableFile).
   */
  async synthesizeStream(
    text: string,
    options?: TtsSynthesizeOptions,
  ): Promise<{ stream: Readable; mimeType: string }> {
    const voice = options?.voice ?? DEFAULT_TTS_VOICE;
    const response_format = options?.response_format ?? 'mp3';
    const input = clipTtsInput(text);
    try {
      const response = await this.client.audio.speech.create({
        model: this.model,
        voice,
        input,
        response_format,
      });
      const body = response.body;
      if (!body) {
        throw new Error('TTS response had no body');
      }
      const stream = Readable.fromWeb(body as WebReadableStream);
      return { stream, mimeType: mimeForFormat(response_format) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`TTS stream failed (${this.ttsDebugContext()}): ${msg}`);
      this.logTtsFailureHint(err);
      throw err;
    }
  }
}
