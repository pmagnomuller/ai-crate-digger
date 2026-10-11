import './style.css';
import { type ChatSseEvent, postChatStream, postSpeak } from './sse';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app missing');

app.innerHTML = `
  <section class="hero" aria-label="AI Crate Digger">
    <div class="hero-copy">
      <h1 class="brand">AI Crate Digger</h1>
      <p class="hero-headline">Your listening taste, dug into human vinyl.</p>
      <p class="hero-support">
        Connect Spotify, shape one taste profile, and get catalog picks grounded in real records — never AI-generated music.
      </p>
      <div class="cta-group">
        <a class="btn btn-primary" id="connectSpotify" href="/auth/spotify/login">Connect Spotify</a>
        <a class="btn btn-secondary" href="#taste">See how it works</a>
        <button type="button" class="btn btn-ghost" id="logout" hidden>Log out</button>
      </div>
      <p id="authStatus" class="status-line" aria-live="polite"></p>
    </div>
    <div class="hero-visual" aria-hidden="true">
      <div class="vinyl-stage">
        <div class="vinyl-glow"></div>
        <div class="vinyl"></div>
      </div>
    </div>
  </section>

  <main class="flow">
    <section class="section" id="taste" aria-labelledby="tasteHeading">
      <div class="section-head">
        <p class="section-kicker">Taste</p>
        <h2 id="tasteHeading">Build your digger profile</h2>
        <p>We pull top artists and tracks from Spotify, store one taste document, and embed it for matching.</p>
      </div>
      <div class="toolbar">
        <button type="button" class="btn btn-primary" id="syncTaste" disabled>Sync taste from Spotify</button>
        <button type="button" class="btn btn-secondary" id="loadTaste" disabled>Refresh</button>
      </div>
      <div class="interaction-shell" id="tasteOut" aria-live="polite">
        <p class="taste-empty">Connect Spotify, then sync to see genres, artists, and your taste summary.</p>
      </div>
    </section>

    <section class="section" id="recs" aria-labelledby="recsHeading">
      <div class="section-head">
        <p class="section-kicker">Recommendations</p>
        <h2 id="recsHeading">Picks from the crates</h2>
        <p>Ranked against your taste embedding in the vinyl catalog. Human-made releases only.</p>
      </div>
      <div class="toolbar">
        <button type="button" class="btn btn-primary" id="getRecs" disabled>Get recommendations</button>
      </div>
      <div class="interaction-shell" id="recsOut" aria-live="polite">
        <p class="recs-empty">Sync taste first, then pull a short list of grounded recommendations.</p>
      </div>
    </section>

    <section class="section" id="chat" aria-labelledby="chatHeading">
      <div class="section-head">
        <p class="section-kicker">Ask</p>
        <h2 id="chatHeading">Talk with the digger</h2>
        <p>Optional catalog chat for vibes, budget, and follow-ups — still bound to human music only.</p>
      </div>
      <div class="interaction-shell">
        <div class="chat-compose">
          <textarea id="prompt" placeholder="e.g. Late-night deep house under $30, warm and dusty…" spellcheck="true"></textarea>
          <div class="chat-options">
            <label><input type="checkbox" id="includeAudio" /> Include audio in stream</label>
            <label>Voice
              <select id="voice">
                <option value="nova">nova</option>
                <option value="onyx">onyx</option>
              </select>
            </label>
          </div>
          <div class="toolbar" style="margin-bottom:0">
            <button type="button" class="btn btn-primary" id="send">Send</button>
            <button type="button" class="btn btn-secondary" id="speak" disabled>Play last answer</button>
          </div>
        </div>
        <div id="meta" class="chat-meta"></div>
        <div id="out" class="chat-answer" aria-live="polite"></div>
      </div>
    </section>
  </main>

  <p id="err" class="error-banner" role="alert"></p>
  <audio id="player" class="site-audio" controls></audio>
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

type RecItem = {
  id: string;
  title: string;
  artist: string;
  label: string;
  genre: string[];
  price: number;
  similarity: number;
  whyItFits: string[];
};

type RecResponse = {
  policy: string;
  recommendations: RecItem[];
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
  err: app.querySelector<HTMLParagraphElement>('#err')!,
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
    ? `Connected as ${user.displayName ?? user.spotifyId}`
    : 'Not connected yet.';
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderTaste(taste: TasteProfile) {
  const genreLine = taste.genres.slice(0, 12).map(escapeHtml).join(' · ');
  const artists = taste.topArtists
    .slice(0, 8)
    .map((a) => `<li>${escapeHtml(a.name)}</li>`)
    .join('');
  const tracks = taste.topTracks
    .slice(0, 6)
    .map((t) => `<li>${escapeHtml(t.name)} — ${escapeHtml(t.artist)}</li>`)
    .join('');

  el.tasteOut.innerHTML = `
    <div class="taste-grid">
      <p class="taste-summary">${escapeHtml(taste.summaryText)}</p>
      <div class="meta-row">
        <span>Source: ${escapeHtml(taste.sourcePlatform)}</span>
        <span>Embedding: ${taste.hasEmbedding ? 'ready' : 'missing'}</span>
        <span>Synced: ${escapeHtml(taste.lastSyncedAt ?? 'unknown')}</span>
      </div>
      ${genreLine ? `<p class="genre-line">${genreLine}</p>` : ''}
      ${artists ? `<div><strong>Top artists</strong><ul class="signal-list">${artists}</ul></div>` : ''}
      ${tracks ? `<div><strong>Top tracks</strong><ul class="signal-list">${tracks}</ul></div>` : ''}
    </div>
  `;
}

function renderTasteEmpty(message: string) {
  el.tasteOut.innerHTML = `<p class="taste-empty">${escapeHtml(message)}</p>`;
}

function renderRecs(data: RecResponse) {
  if (!data.recommendations.length) {
    el.recsOut.innerHTML =
      '<p class="recs-empty">No catalog matches yet. Seed Discogs records with embeddings, then retry.</p>';
    return;
  }

  const items = data.recommendations
    .map((r, i) => {
      const why = (r.whyItFits ?? [])
        .map((w) => `<li>${escapeHtml(w)}</li>`)
        .join('');
      return `
        <li class="rec-item">
          <span class="rec-index">${i + 1}</span>
          <div>
            <h3>${escapeHtml(r.artist)} — ${escapeHtml(r.title)}</h3>
            <p class="meta">${escapeHtml(r.label)} · ${(r.genre ?? []).map(escapeHtml).join(', ') || 'n/a'} · $${r.price}</p>
            ${why ? `<ul class="why">${why}</ul>` : ''}
          </div>
          <span class="rec-sim">${r.similarity.toFixed(3)}</span>
        </li>
      `;
    })
    .join('');

  el.recsOut.innerHTML = `
    <p class="policy-note">${escapeHtml(data.policy)}</p>
    <ul class="recs-list">${items}</ul>
  `;
}

function renderRecsEmpty(message: string) {
  el.recsOut.innerHTML = `<p class="recs-empty">${escapeHtml(message)}</p>`;
}

async function refreshSession() {
  try {
    const user = await api<PublicUser>('/auth/me');
    setAuthedUi(user);
    try {
      const taste = await api<TasteProfile>('/taste');
      renderTaste(taste);
    } catch {
      renderTasteEmpty('Connected. Sync taste from Spotify to continue.');
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
      appendMeta(`tool_call: ${ev.data.toolName}`);
      break;
    case 'tool_result':
      appendMeta(`tool_result: ${ev.data.toolName}`);
      break;
    case 'final_answer': {
      streamingText.current = ev.data.text;
      el.out.textContent = ev.data.text;
      lastAnswerText = ev.data.text;
      el.speak.disabled = !lastAnswerText.trim();
      break;
    }
    case 'tts_truncate':
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

/** Design preview of filled taste/recs when live Spotify isn’t available. */
function loadPreviewState() {
  setAuthedUi({
    id: 'preview',
    spotifyId: 'preview-user',
    displayName: 'Preview listener',
  });
  el.authStatus.textContent = 'Preview mode — sample taste & recommendations (not live Spotify).';
  renderTaste({
    sourcePlatform: 'spotify',
    hasEmbedding: true,
    lastSyncedAt: new Date().toISOString(),
    genres: ['deep house', 'jazz', 'broken beat', 'soul'],
    topArtists: [
      { name: 'Moodymann', genres: ['house'] },
      { name: 'Madlib', genres: ['hip hop'] },
      { name: 'Theo Parrish', genres: ['electronic'] },
    ],
    topTracks: [
      { name: 'Dem Young Lights', artist: 'Moodymann' },
      { name: 'Road of the Lonely Ones', artist: 'Madlib' },
    ],
    summaryText:
      "Preview listener's music taste profile from Spotify (human-made music only). Favorite genres: deep house, jazz, broken beat, soul. Prefer physical vinyl and human-performed releases.",
  });
  renderRecs({
    policy:
      'Never recommend AI-generated music. Results are grounded in the vinyl catalog and your Spotify taste embedding.',
    recommendations: [
      {
        id: '1',
        title: 'Dem Young Lights',
        artist: 'Moodymann',
        label: 'KDJ',
        genre: ['House'],
        price: 28,
        similarity: 0.91,
        whyItFits: [
          'Matches a top Spotify artist: Moodymann',
          'Human-made catalog release (AI-generated music excluded)',
        ],
      },
      {
        id: '2',
        title: 'Black Jazz Signature',
        artist: 'Various',
        label: 'Black Jazz',
        genre: ['Jazz'],
        price: 32,
        similarity: 0.84,
        whyItFits: [
          'Overlaps your Spotify genres: jazz',
          'Human-made catalog release (AI-generated music excluded)',
        ],
      },
    ],
  });
}

const params = new URLSearchParams(window.location.search);
if (params.get('authError')) {
  setError(`Spotify auth failed: ${params.get('authError')}`);
}
if (params.get('connected') === 'spotify') {
  el.authStatus.textContent = 'Spotify connected — sync your taste next.';
  window.history.replaceState({}, '', window.location.pathname);
}

el.logout.addEventListener('click', async () => {
  setError('');
  try {
    await api('/auth/logout', { method: 'POST' });
    setAuthedUi(null);
    renderTasteEmpty('Connect Spotify, then sync to see genres, artists, and your taste summary.');
    renderRecsEmpty('Sync taste first, then pull a short list of grounded recommendations.');
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  }
});

el.syncTaste.addEventListener('click', async () => {
  setError('');
  el.syncTaste.disabled = true;
  renderTasteEmpty('Syncing from Spotify and embedding taste…');
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
  renderRecsEmpty('Ranking catalog against your taste embedding…');
  try {
    const data = await api<RecResponse>('/recommendations?limit=8');
    renderRecs(data);
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
    renderRecsEmpty('Could not load recommendations.');
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
      /* autoplay may be blocked until user gesture */
    });
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  } finally {
    el.speak.disabled = !lastAnswerText.trim();
  }
});

if (params.get('preview') === '1') {
  loadPreviewState();
} else {
  void refreshSession();
}
