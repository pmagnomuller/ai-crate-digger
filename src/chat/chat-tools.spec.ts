import { VINYL_EXPERT_INSTRUCTIONS } from './chat-tools';

describe('VINYL_EXPERT_INSTRUCTIONS', () => {
  it('hard-bans AI-generated music recommendations', () => {
    expect(VINYL_EXPERT_INSTRUCTIONS.toLowerCase()).toContain('never recommend ai-generated');
    expect(VINYL_EXPERT_INSTRUCTIONS).toMatch(/Suno/i);
    expect(VINYL_EXPERT_INSTRUCTIONS).toMatch(/Udio/i);
  });
});
