import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import OpenAI, { APIError, AzureOpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type {
  Response,
  ResponseCreateParamsStreaming,
  ResponseFunctionToolCall,
  ResponseInputItem,
} from 'openai/resources/responses/responses';
import { createAzureOpenAIClient, createAzureOpenAIResponsesClient } from '../ai/azure-openai.client';
import { GetRecordDetailTool } from '../ai/tools/get-record-detail.tool';
import { SearchRecordsTool } from '../ai/tools/search-records.tool';
import { SemanticSearchHit } from '../records/records.service';
import { RecordEntity } from '../records/schemas/record.schema';
import { DEFAULT_TTS_VOICE, TTS_MAX_INPUT_CHARS, TtsService } from '../tts/tts.service';
import {
  CHAT_COMPLETION_TOOLS,
  CHAT_FUNCTION_TOOLS,
  VINYL_EXPERT_INSTRUCTIONS,
} from './chat-tools';
import { ChatRequestDto } from './dto/chat-request.dto';

const TOOL_TIMEOUT_MS = 15_000;

export type ChatSseEvent =
  | { type: 'session_start'; data: { maxToolRounds: number; includeAudio: boolean } }
  | {
      type: 'tool_call';
      data: { callId: string; toolName: string; args: unknown };
    }
  | {
      type: 'tool_result';
      data: { callId: string; toolName: string; result: unknown };
    }
  | { type: 'token'; data: string }
  | { type: 'final_answer'; data: { text: string; audio?: { mimeType: string; base64Audio: string } } }
  | { type: 'tts_truncated'; data: { originalChars: number; sentChars: number } }
  | { type: 'tts_error'; data: { message: string } }
  | { type: 'error'; data: { message: string; code?: string } };

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return s;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('tool_timeout')), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

function slimRecordForLlm(r: RecordEntity | SemanticSearchHit): Record<string, unknown> {
  const o = r as unknown as Record<string, unknown> & { _id?: unknown; embedding?: unknown };
  const { embedding: _e, ...rest } = o;
  return { ...rest, _id: o._id != null ? String(o._id) : undefined };
}

/** Azure returns 404 for `/openai/v1/responses` when v1 preview is not enabled on the resource. */
function isResponsesApiNotFoundError(err: unknown): boolean {
  if (err instanceof APIError && err.status === 404) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /\b404\b/.test(msg) && /not\s*found/i.test(msg);
}

/** Azure / OpenAI stream errors sometimes use smart quotes or odd spacing in `message`. */
function isResponsesInputRequiredErrorMessage(msg: string): boolean {
  const n = msg
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .trim();
  // Message is often `400 'input' is a required property` — allow punctuation between `input` and `is`.
  return /\binput\b.*\bis\s+a\s+required\s+property\b/i.test(n);
}

/**
 * Use Chat Completions when the Responses API is unavailable or the stream never completes
 * (common on Azure resources without Responses v1 / Foundry streaming parity).
 */
export function shouldFallbackToChatCompletions(err: unknown): boolean {
  if (isResponsesApiNotFoundError(err)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === 'incomplete_stream') return true;
  // Covers APIError 400 and stream `error` events (rethrown as plain `Error(message)`).
  if (isResponsesInputRequiredErrorMessage(msg)) return true;
  return false;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly responsesClient: OpenAI;
  private readonly azureClient: AzureOpenAI;
  private readonly chatModel: string;

  constructor(
    configService: ConfigService,
    private readonly searchRecordsTool: SearchRecordsTool,
    private readonly getRecordDetailTool: GetRecordDetailTool,
    private readonly ttsService: TtsService,
  ) {
    this.responsesClient = createAzureOpenAIResponsesClient(configService);
    this.azureClient = createAzureOpenAIClient(configService);
    this.chatModel = configService.getOrThrow<string>('azureOpenAI.chatDeployment');
  }

  streamRecommendations(dto: ChatRequestDto): Observable<ChatSseEvent> {
    return new Observable<ChatSseEvent>((subscriber) => {
      void (async () => {
        const maxRounds = dto.maxToolRounds ?? 5;
        const maxResults = dto.maxResults ?? 6;
        const includeAudio = dto.includeAudio !== false;

        try {
          subscriber.next({
            type: 'session_start',
            data: { maxToolRounds: maxRounds, includeAudio },
          });

          let finalText = '';
          try {
            finalText = await this.runWithResponsesApi(dto, subscriber, maxRounds, maxResults);
          } catch (err) {
            if (!shouldFallbackToChatCompletions(err)) {
              throw err;
            }
            finalText = await this.runWithChatCompletionsApi(dto, subscriber, maxRounds, maxResults);
          }

          if (!finalText) {
            subscriber.next({
              type: 'error',
              data: { message: 'No assistant text produced (empty response or max tool rounds).' },
            });
          }

          let audio: { mimeType: string; base64Audio: string } | undefined;
          if (includeAudio && finalText) {
            let ttsInput = finalText;
            if (ttsInput.length > TTS_MAX_INPUT_CHARS) {
              subscriber.next({
                type: 'tts_truncated',
                data: { originalChars: ttsInput.length, sentChars: TTS_MAX_INPUT_CHARS },
              });
              ttsInput = ttsInput.slice(0, TTS_MAX_INPUT_CHARS);
            }
            try {
              audio = await this.ttsService.synthesize(ttsInput, {
                voice: dto.voice ?? DEFAULT_TTS_VOICE,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              this.logger.warn(`TTS failed: ${message}`);
              subscriber.next({ type: 'tts_error', data: { message } });
            }
          }

          subscriber.next({
            type: 'final_answer',
            data: audio ? { text: finalText, audio } : { text: finalText },
          });
          subscriber.complete();
        } catch (error) {
          subscriber.next({
            type: 'error',
            data: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
          subscriber.error(error);
        }
      })();
    });
  }

  private async runWithResponsesApi(
    dto: ChatRequestDto,
    subscriber: { next: (v: ChatSseEvent) => void },
    maxRounds: number,
    maxResults: number,
  ): Promise<string> {
    let previousResponseId: string | undefined;
    let toolFollowUpInput: ResponseInputItem[] | undefined;
    let finalText = '';

    outer: for (let round = 0; round < maxRounds; round++) {
      let roundText = '';

      const params: ResponseCreateParamsStreaming = !previousResponseId
        ? {
            model: this.chatModel,
            stream: true,
            parallel_tool_calls: true,
            instructions: VINYL_EXPERT_INSTRUCTIONS,
            tools: CHAT_FUNCTION_TOOLS,
            input: this.buildInitialInput(dto),
            text: dto.verbosity ? { verbosity: dto.verbosity } : undefined,
          }
        : {
            model: this.chatModel,
            stream: true,
            parallel_tool_calls: true,
            previous_response_id: previousResponseId,
            input: toolFollowUpInput ?? [],
          };

      toolFollowUpInput = undefined;

      const stream = await this.responsesClient.responses.create(params);

      let completedResponse: Response | undefined;
      let createdResponseId: string | undefined;

      for await (const event of stream) {
        if (event.type === 'error') {
          const errText =
            typeof event.message === 'string' ? event.message : JSON.stringify(event.message);
          subscriber.next({
            type: 'error',
            data: { message: errText, code: event.code ?? undefined },
          });
          throw new Error(errText);
        }

        if (event.type === 'response.failed') {
          const msg = event.response.error?.message ?? 'response.failed';
          subscriber.next({ type: 'error', data: { message: msg } });
          throw new Error(msg);
        }

        if (event.type === 'response.created') {
          createdResponseId = event.response.id;
        }

        if (event.type === 'response.output_text.delta') {
          roundText += event.delta;
          subscriber.next({ type: 'token', data: event.delta });
        }

        if (event.type === 'response.completed' || event.type === 'response.incomplete') {
          completedResponse = event.response;
          break;
        }
      }

      if (!completedResponse && createdResponseId) {
        try {
          completedResponse = await this.responsesClient.responses.retrieve(createdResponseId);
        } catch (e) {
          subscriber.next({
            type: 'error',
            data: {
              message:
                e instanceof Error ? e.message : 'Failed to retrieve response after stream ended.',
            },
          });
          throw e instanceof Error ? e : new Error(String(e));
        }
      }

      if (!completedResponse) {
        try {
          const direct = await this.responsesClient.responses.create({
            ...params,
            stream: false,
          });
          if ('output' in direct && Array.isArray(direct.output)) {
            completedResponse = direct;
            const full = direct.output_text ?? '';
            if (full && !roundText) {
              subscriber.next({ type: 'token', data: full });
              roundText = full;
            }
          }
        } catch (e) {
          subscriber.next({
            type: 'error',
            data: {
              message:
                e instanceof Error ? e.message : 'Responses API request failed after empty stream.',
            },
          });
          throw e instanceof Error ? e : new Error(String(e));
        }
      }

      if (!completedResponse) {
        subscriber.next({
          type: 'error',
          data: {
            message:
              'Stream ended without a terminal response event. Set AZURE_OPENAI_RESPONSES_API_VERSION=v1 on Foundry, or enable v1 preview on the Azure resource.',
          },
        });
        throw new Error('incomplete_stream');
      }

      const response = completedResponse;
      previousResponseId = response.id;

      const calls: ResponseFunctionToolCall[] = [];
      for (const item of response.output) {
        if (item.type === 'function_call') {
          calls.push(item);
        }
      }

      if (calls.length === 0) {
        finalText = roundText || response.output_text || '';
        break outer;
      }

      const outputs: ResponseInputItem[] = await Promise.all(
        calls.map(async (c) => {
          subscriber.next({
            type: 'tool_call',
            data: {
              callId: c.call_id,
              toolName: c.name,
              args: safeJsonParse(c.arguments),
            },
          });

          let result: unknown;
          try {
            result = await withTimeout(
              this.executeTool(c.name, c.arguments, maxResults),
              TOOL_TIMEOUT_MS,
            );
          } catch (e) {
            result = {
              error: e instanceof Error ? e.message : String(e),
            };
          }

          subscriber.next({
            type: 'tool_result',
            data: {
              callId: c.call_id,
              toolName: c.name,
              result,
            },
          });

          return {
            type: 'function_call_output' as const,
            call_id: c.call_id,
            output: JSON.stringify(result),
          };
        }),
      );

      toolFollowUpInput = outputs;
      continue outer;
    }

    return finalText;
  }

  private async runWithChatCompletionsApi(
    dto: ChatRequestDto,
    subscriber: { next: (v: ChatSseEvent) => void },
    maxRounds: number,
    maxResults: number,
  ): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: VINYL_EXPERT_INSTRUCTIONS },
    ];
    const history = dto.history ?? [];
    for (const h of history) {
      messages.push({ role: h.role, content: h.content });
    }
    messages.push({ role: 'user', content: dto.prompt });

    let finalText = '';

    for (let round = 0; round < maxRounds; round++) {
      const completion = await this.azureClient.chat.completions.create({
        model: this.chatModel,
        messages,
        tools: CHAT_COMPLETION_TOOLS,
        tool_choice: 'auto',
        parallel_tool_calls: true,
      });

      const choice = completion.choices[0];
      if (!choice?.message) {
        break;
      }

      const msg = choice.message;
      const toolCalls = msg.tool_calls;

      if (toolCalls?.length) {
        messages.push({
          role: 'assistant',
          content: msg.content,
          tool_calls: toolCalls,
        });

        const toolOutputs = await Promise.all(
          toolCalls.map(async (tc) => {
            if (tc.type !== 'function') {
              return { id: tc.id, content: JSON.stringify({ error: 'unsupported_tool_type' }) };
            }
            subscriber.next({
              type: 'tool_call',
              data: {
                callId: tc.id,
                toolName: tc.function.name,
                args: safeJsonParse(tc.function.arguments),
              },
            });
            let result: unknown;
            try {
              result = await withTimeout(
                this.executeTool(tc.function.name, tc.function.arguments, maxResults),
                TOOL_TIMEOUT_MS,
              );
            } catch (e) {
              result = { error: e instanceof Error ? e.message : String(e) };
            }
            subscriber.next({
              type: 'tool_result',
              data: { callId: tc.id, toolName: tc.function.name, result },
            });
            return { id: tc.id, content: JSON.stringify(result) };
          }),
        );

        for (const out of toolOutputs) {
          messages.push({ role: 'tool', tool_call_id: out.id, content: out.content });
        }
        continue;
      }

      finalText = msg.content ?? '';
      if (finalText) {
        subscriber.next({ type: 'token', data: finalText });
      }
      break;
    }

    return finalText;
  }

  /**
   * Azure Responses often rejects bare string `input` or accepts it inconsistently; use
   * `type: 'message'` items (required discriminator) for every turn.
   */
  private buildInitialInput(dto: ChatRequestDto): ResponseInputItem[] {
    const history = dto.history ?? [];
    const items: ResponseInputItem[] = [];
    for (const h of history) {
      items.push({ type: 'message', role: h.role, content: h.content });
    }
    items.push({ type: 'message', role: 'user', content: dto.prompt });
    return items;
  }

  private async executeTool(
    name: string,
    argsJson: string,
    maxResults: number,
  ): Promise<unknown> {
    const args = JSON.parse(argsJson) as Record<string, unknown>;
    if (name === 'search_records') {
      const records = await this.searchRecordsTool.run({
        query: String(args.query ?? ''),
        genre: args.genre != null ? String(args.genre) : undefined,
        vibe: args.vibe != null ? String(args.vibe) : undefined,
        constraints: { limit: maxResults },
      });
      return {
        records: records.map((r) => slimRecordForLlm(r)),
      };
    }
    if (name === 'get_record_detail') {
      return this.getRecordDetailTool.run({ id: String(args.id ?? '') });
    }
    return { error: `Unknown tool: ${name}` };
  }
}
