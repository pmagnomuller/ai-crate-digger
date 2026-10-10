import { looksLikeAiGeneratedMusic, ANTI_AI_MUSIC_POLICY } from './anti-ai-music';

describe('anti-ai-music', () => {
  it('exposes a hard policy string for prompts and UI', () => {
    expect(ANTI_AI_MUSIC_POLICY.toLowerCase()).toContain('never recommend ai-generated');
  });

  it('flags explicit isAiGenerated', () => {
    expect(looksLikeAiGeneratedMusic({ title: 'Blue', artist: 'Alice', isAiGenerated: true })).toBe(
      true,
    );
  });

  it('flags denylisted artist/title tokens', () => {
    expect(looksLikeAiGeneratedMusic({ title: 'Sunset', artist: 'Suno Wave' })).toBe(true);
    expect(looksLikeAiGeneratedMusic({ title: 'AI Generated Beats', artist: 'Demo' })).toBe(true);
    expect(looksLikeAiGeneratedMusic({ title: 'Loop', artist: 'Udio Collective' })).toBe(true);
  });

  it('allows ordinary human catalog rows', () => {
    expect(
      looksLikeAiGeneratedMusic({
        title: 'Kind of Blue',
        artist: 'Miles Davis',
        label: 'Columbia',
        isAiGenerated: false,
      }),
    ).toBe(false);
  });
});
