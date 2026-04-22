export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  audioBase64?: string;
  audioMimeType?: string;
};

export type ChatHistoryMessage = {
  role: ChatRole;
  content: string;
};

export type TtsVoice = 'nova' | 'onyx';

export type ChatRequest = {
  prompt: string;
  history?: ChatHistoryMessage[];
  includeAudio?: boolean;
  voice?: TtsVoice;
  maxResults?: number;
  verbosity?: 'low' | 'medium' | 'high';
  maxToolRounds?: number;
};

export type ChatSseEvent =
  | { type: 'session_start'; data: { maxToolRounds: number; includeAudio: boolean } }
  | { type: 'tool_call'; data: { callId: string; toolName: string; args: unknown } }
  | { type: 'tool_result'; data: { callId: string; toolName: string; result: unknown } }
  | { type: 'token'; data: string }
  | {
      type: 'final_answer';
      data: { text: string; audio?: { mimeType: string; base64Audio: string } };
    }
  | { type: 'tts_truncated'; data: { originalChars: number; sentChars: number } }
  | { type: 'tts_error'; data: { message: string } }
  | { type: 'error'; data: { message: string; code?: string } };
