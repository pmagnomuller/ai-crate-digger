import EventSource from 'react-native-sse';
import { ChatRequest, ChatSseEvent, TtsVoice } from '../types/chat';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

function getStreamUrl(): string {
  return `${API_BASE_URL.replace(/\/$/, '')}/chat/stream`;
}

function getSpeakUrl(): string {
  return `${API_BASE_URL.replace(/\/$/, '')}/chat/speak`;
}

function parseEvent(raw: string): ChatSseEvent | null {
  try {
    return JSON.parse(raw) as ChatSseEvent;
  } catch {
    return null;
  }
}

export type StreamHandlers = {
  onEvent: (event: ChatSseEvent) => void;
  onError: (message: string) => void;
  onDone: () => void;
};

export function streamChat(request: ChatRequest, handlers: StreamHandlers): () => void {
  const source = new EventSource(getStreamUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    pollingInterval: 0,
  });

  source.addEventListener('message', (event) => {
    const payload = typeof event.data === 'string' ? parseEvent(event.data) : null;
    if (!payload) return;

    handlers.onEvent(payload);
    if (payload.type === 'final_answer' || payload.type === 'error') {
      handlers.onDone();
      source.close();
    }
  });

  source.addEventListener('error', (event) => {
    const message =
      event && 'message' in event && typeof event.message === 'string'
        ? event.message
        : 'Stream connection failed';
    handlers.onError(message);
    handlers.onDone();
    source.close();
  });

  return () => source.close();
}

export async function speakText(text: string, voice: TtsVoice = 'nova'): Promise<string> {
  const response = await fetch(getSpeakUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, voice }),
  });

  if (!response.ok) {
    throw new Error(`TTS request failed with status ${response.status}`);
  }

  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Unable to parse audio response'));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error('Unable to read audio response'));
    reader.readAsDataURL(blob);
  });
}
