import './style.css';
import { type ChatSseEvent, postChatStream, postSpeak } from './sse';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app missing');

app.innerHTML = `
  <header class="top">
    <h1>AI Crate Digger</h1>
    <p class="policy">Human music only — we never recommend AI-generated tracks.</p>
  </header>

  <section class="panel" id="connectPanel" aria-labelledby="connectHeading">
    <h2 id="connectHeading">1. Connect Spotify</h2>
    <p class="hint">Link your Spotify account to build a taste profile from your top artists and tracks.</p>
    <div class="row">
      <a class="button" id="connectSpotify" href="/auth/spotify/login">Connect Spotify</a>
      <button type="button" id="logout" class="ghost" hidden>Log out</button>
    </div>
    <p id="authStatus" class="status" aria-live="polite"></p>
  </section>

  <section class="panel" id="tastePanel" aria-labelledby="tasteHeading">
    <h2 id="tasteHeading">2. Taste profile</h2>
    <p class="hint">We store a MongoDB taste document and embed it with Azure text embeddings.</p>
    <div class="row">
      <button type="button" id="syncTaste" disabled>Sync taste from Spotify</button>
      <button type="button" id="loadTaste" class="ghost" disabled>Refresh view</button>
    </div>
    <div id="tasteOut" class="output taste" aria-live="polite">Not synced yet.</div>
  </section>

  <section class="panel" id="recsPanel" aria-labelledby="recsHeading">
    <h2 id="recsHeading">3. Recommendations</h2>
    <p class="hint">Grounded in the vinyl catalog via your taste embedding. AI-generated music is filtered out.</p>
    <div class="row">
      <button type="button" id="getRecs" disabled>Get recommendations</button>
    </div>
    <div id="recsOut" class="output" aria-live="polite"></div>
  </section>

  <section class="panel chat-panel" aria-labelledby="chatHeading">
    <h2 id="chatHeading">Chat (optional)</h2>
    <p class="hint">Catalog chat still available. Same anti-AI rule applies in the assistant prompt.</p>
    <div class="row">
      <label><input type="checkbox" id="includeAudio" /> Include audio in SSE</label>
      <label>Voice <select id="voice"><option value="nova">nova</option><option value="onyx">onyx</option></select></label>
    </div>
    <textarea id="prompt" placeholder="Ask about records…" spellcheck="true"></textarea>
    <div class="row" style="margin-top:0.75rem">
      <button type="button" id="send">Send</button>
      <button type="button" id="speak" disabled>Play last answer (TTS)</button>
    </div>
    <div id="meta" class="output meta"></div>
    <div id="out" class="output" aria-live="polite"></div>
  </section>

  <div id="err" class="error" role="alert"></div>
  <audio id="player" controls></audio>
`;

type PublicUser = { id: string; spotifyId: string; displayName?: string; email?: string };

type TasteProfile = {
  genres: string[];
  topArtists: Array<{ name: string; genres: string[] }>;
  topTracks: Array<{ name: string; artist: string }>;
  summaryText: string;
  hasEmbedding: boolean;
  lastSyncedAt?: string;
  sourcePlatform: string;
};

type RecResponse = {
  policy: string;
  recommendations: Array<{
    id: string;
    title: string;
    artist: string;
    label: string;
    genre: string[];
    price: number;
    similarity: number;
    whyItFits: string[];
  }>;
};

const el = {
  connectSpotify: app.querySelector<HTMLAnchorElement>('#connectSpotify')!,
  logout: app.querySelector<HTMLButtonElement>('#logout')!,
  authStatus: app.querySelector<HTMLParagraphElement>('#authStatus')!,
  syncTaste: app.querySelector<HTMLButtonElement>('#syncTaste')!,
  loadTaste: app.querySelector<HTMLButtonElement>('#loadTaste')!,
  tasteOut: app.querySelector<HTMLDivElement>('#tasteOut')!,
  getRecs: app.querySelector<HTMLButtonElement>('#getRecs')!,
  recsOut: app.querySelector<HTMLDivElement>('#recsOut')!,
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
let currentUser: PublicUser | null = null;

function setError(msg: string) {
  el.err.textContent = msg;
}

function setAuthedUi(user: PublicUser | null) {
  currentUser = user;
  const authed = Boolean(user);
  el.logout.hidden = !authed;
  el.connectSpotify.hidden = authed;
  el.syncTaste.disabled = !authed;
  el.loadTaste.disabled = !authed;
  el.getRecs.disabled = !authed;
  el.authStatus.textContent = user
    ? `Connected as ${user.displayName ?? user.spotifyId} (Spotify)`
    : 'Not connected.';
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) detail = body.message.join(', ');
      else if (body.message) detail = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(`${path}: ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function renderTaste(taste: TasteProfile) {
  const artists = taste.topArtists
    .slice(0, 8)
    .map((a) => a.name)
    .join(', ');
  const tracks = taste.topTracks
    .slice(0, 6)
    .map((t) => `${t.name} — ${t.artist}`)
    .join('\n');
  el.tasteOut.textContent = [
    `Platform: ${taste.sourcePlatform}`,
    `Embedding: ${taste.hasEmbedding ? 'ready' : 'missing'}`,
    `Synced: ${taste.lastSyncedAt ?? 'unknown'}`,
    `Genres: ${taste.genres.slice(0, 12).join(', ') || '(none)'}`,
    `Top artists: ${artists || '(none)'}`,
    tracks ? `Top tracks:\n${tracks}` : '',
    '',
    `Summary: ${taste.summaryText}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

function renderRecs(data: RecResponse) {
  if (!data.recommendations.length) {
    el.recsOut.textContent = 'No catalog matches yet. Seed Discogs records with embeddings, then retry.';
    return;
  }
  el.recsOut.textContent = [
    data.policy,
    '',
    ...data.recommendations.map((r, i) => {
      const why = r.whyItFits.map((w) => `   - ${w}`).join('\n');
      return `${i + 1}. ${r.artist} — ${r.title} (${r.label})\n   genres: ${(r.genre ?? []).join(', ') || 'n/a'} · $${r.price} · sim ${r.similarity.toFixed(3)}\n${why}`;
    }),
  ].join('\n');
}

async function refreshSession() {
  try {
    const user = await api<PublicUser>('/auth/me');
    setAuthedUi(user);
    try {
      const taste = await api<TasteProfile>('/taste');
      renderTaste(taste);
    } catch {
      el.tasteOut.textContent = 'Connected. Sync taste from Spotify to continue.';
    }
  } catch {
    setAuthedUi(null);
  }
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
        `tts_truncate: answer was ${ev.data.originalChars} chars; first ${ev.data.sentChars} sent to TTS`,
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

const params = new URLSearchParams(window.location.search);
if (params.get('authError')) {
  setError(`Spotify auth failed: ${params.get('authError')}`);
}
if (params.get('connected') === 'spotify') {
  el.authStatus.textContent = 'Spotify connected — sync your taste next.';
  window.history.replaceState({}, '', '/');
}

el.logout.addEventListener('click', async () => {
  setError('');
  try {
    await api('/auth/logout', { method: 'POST' });
    setAuthedUi(null);
    el.tasteOut.textContent = 'Not synced yet.';
    el.recsOut.textContent = '';
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  }
});

el.syncTaste.addEventListener('click', async () => {
  setError('');
  el.syncTaste.disabled = true;
  el.tasteOut.textContent = 'Syncing from Spotify and embedding taste…';
  try {
    const taste = await api<TasteProfile>('/taste/sync', { method: 'POST' });
    renderTaste(taste);
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  } finally {
    el.syncTaste.disabled = !currentUser;
  }
});

el.loadTaste.addEventListener('click', async () => {
  setError('');
  try {
    const taste = await api<TasteProfile>('/taste');
    renderTaste(taste);
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  }
});

el.getRecs.addEventListener('click', async () => {
  setError('');
  el.getRecs.disabled = true;
  el.recsOut.textContent = 'Ranking catalog against your taste embedding…';
  try {
    const data = await api<RecResponse>('/recommendations?limit=8');
    renderRecs(data);
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
    el.recsOut.textContent = '';
  } finally {
    el.getRecs.disabled = !currentUser;
  }
});

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

void refreshSession();
