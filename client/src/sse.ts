/** Mirrors backend `ChatSseEvent` (see src/chat/chat.service.ts). */
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
  | {
      type: 'final_answer';
      data: { text: string; audio?: { mimeType: string; base64Audio: string } };
    }
  | { type: 'tts_truncated'; data: { originalChars: number; sentChars: number } }
  | { type: 'tts_error'; data: { message: string } }
  | { type: 'error'; data: { message: string; code?: string } };

function parseSseBlock(block: string): ChatSseEvent | null {
  for (const line of block.split('\n')) {
    if (line.startsWith('data:')) {
      const json = line.slice(5).trimStart();
      if (!json) continue;
      return JSON.parse(json) as ChatSseEvent;
    }
  }
  return null;
}

/** Read NestJS `MessageEvent`-style SSE (`data: JSON` per event). */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatSseEvent, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  const flushBuf = function* (): Generator<ChatSseEvent, void, undefined> {
    while (true) {
      const idx = buf.indexOf('\n\n');
      if (idx === -1) break;
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const ev = parseSseBlock(block);
      if (ev) yield ev;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        buf += decoder.decode(value, { stream: true });
        yield* flushBuf();
      }
      if (done) {
        buf += decoder.decode();
        yield* flushBuf();
        if (buf.trim()) {
          const ev = parseSseBlock(buf);
          if (ev) yield ev;
        }
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export type ChatStreamBody = {
  prompt: string;
  includeAudio?: boolean;
  voice?: 'onyx' | 'nova';
  history?: { role: 'user' | 'assistant'; content: string }[];
};

export async function postChatStream(
  apiBody: ChatStreamBody,
  onEvent: (event: ChatSseEvent) => void,
): Promise<void> {
  const res = await fetch('/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(apiBody),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `${res.status} ${res.statusText}`);
  }

  if (!res.body) {
    throw new Error('Response had no body');
  }

  for await (const ev of parseSseStream(res.body)) {
    onEvent(ev);
  }
}

export async function postSpeak(text: string, voice: 'onyx' | 'nova'): Promise<Blob> {
  const res = await fetch('/chat/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.blob();
}
