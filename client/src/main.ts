import './style.css';
import { type ChatSseEvent, postChatStream, postSpeak } from './sse';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app missing');

app.innerHTML = `
  <h1>AI Crate Digger</h1>
  <p class="hint">Run the API on <code>http://127.0.0.1:3000</code>, then <code>npm run dev:client</code> and open this page (Vite proxies <code>/chat</code>).</p>
  <div class="row">
    <label><input type="checkbox" id="includeAudio" /> Include audio in SSE (base64)</label>
    <label>Voice <select id="voice"><option value="nova">nova</option><option value="onyx">onyx</option></select></label>
  </div>
  <textarea id="prompt" placeholder="Ask about records…" spellcheck="true"></textarea>
  <div class="row" style="margin-top:0.75rem">
    <button type="button" id="send">Send</button>
    <button type="button" id="speak" disabled>Play last answer (TTS)</button>
  </div>
  <div id="meta" class="output meta"></div>
  <div id="out" class="output" aria-live="polite"></div>
  <div id="err" class="error" role="alert"></div>
  <audio id="player" controls></audio>
`;

const el = {
  prompt: app.querySelector<HTMLTextAreaElement>('#prompt')!,
  send: app.querySelector<HTMLButtonElement>('#send')!,
  speak: app.querySelector<HTMLButtonElement>('#speak')!,
  includeAudio: app.querySelector<HTMLInputElement>('#includeAudio')!,
  voice: app.querySelector<HTMLSelectElement>('#voice')!,
  out: app.querySelector<HTMLDivElement>('#out')!,
  meta: app.querySelector<HTMLDivElement>('#meta')!,
  err: app.querySelector<HTMLDivElement>('#err')!,
  player: app.querySelector<HTMLAudioElement>('#player')!,
};

let lastAnswerText = '';
let lastObjectUrl: string | null = null;

function setError(msg: string) {
  el.err.textContent = msg;
}

function appendMeta(line: string) {
  el.meta.textContent = el.meta.textContent ? `${el.meta.textContent}\n${line}` : line;
}

function handleEvent(ev: ChatSseEvent, streamingText: { current: string }) {
  switch (ev.type) {
    case 'session_start':
      appendMeta(
        `session_start: rounds≤${ev.data.maxToolRounds}, includeAudio=${ev.data.includeAudio}`,
      );
      break;
    case 'token':
      streamingText.current += ev.data;
      el.out.textContent = streamingText.current;
      break;
    case 'tool_call':
      appendMeta(`tool_call: ${ev.data.toolName}(${JSON.stringify(ev.data.args)})`);
      break;
    case 'tool_result':
      appendMeta(`tool_result: ${ev.data.toolName}`);
      break;
    case 'final_answer': {
      streamingText.current = ev.data.text;
      el.out.textContent = ev.data.text;
      lastAnswerText = ev.data.text;
      el.speak.disabled = !lastAnswerText.trim();
      if (ev.data.audio?.base64Audio && ev.data.audio.mimeType) {
        appendMeta(`final_answer: inline ${ev.data.audio.mimeType} (${ev.data.audio.base64Audio.length} b64 chars)`);
      } else {
        appendMeta(
          'final_answer: text only (no inline audio — check tts_error above or use “Play last answer”)',
        );
      }
      break;
    }
    case 'tts_truncated':
      appendMeta(
        `tts_truncated: answer was ${ev.data.originalChars} chars; first ${ev.data.sentChars} sent to TTS`,
      );
      break;
    case 'tts_error':
      appendMeta(`tts_error: ${ev.data.message}`);
      setError(`TTS failed: ${ev.data.message}`);
      break;
    case 'error':
      setError(ev.data.message);
      break;
    default:
      break;
  }
}

el.send.addEventListener('click', async () => {
  const prompt = el.prompt.value.trim();
  if (!prompt) return;

  setError('');
  el.meta.textContent = '';
  el.out.textContent = '';
  el.send.disabled = true;
  el.speak.disabled = true;
  lastAnswerText = '';
  if (lastObjectUrl) {
    URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = null;
  }
  el.player.removeAttribute('src');
  el.player.load();

  const voice = el.voice.value as 'onyx' | 'nova';
  const streamingText = { current: '' };

  try {
    await postChatStream(
      {
        prompt,
        includeAudio: el.includeAudio.checked,
        voice,
      },
      (ev) => handleEvent(ev, streamingText),
    );
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  } finally {
    el.send.disabled = false;
    el.speak.disabled = !lastAnswerText.trim();
  }
});

el.speak.addEventListener('click', async () => {
  if (!lastAnswerText.trim()) return;
  setError('');
  el.speak.disabled = true;
  try {
    const blob = await postSpeak(lastAnswerText, el.voice.value as 'onyx' | 'nova');
    if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = URL.createObjectURL(blob);
    el.player.src = lastObjectUrl;
    await el.player.play().catch(() => {
      /* autoplay may be blocked until user gesture — button click counts */
    });
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  } finally {
    el.speak.disabled = !lastAnswerText.trim();
  }
});
