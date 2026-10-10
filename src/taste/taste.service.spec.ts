import { TasteService } from './taste.service';

describe('TasteService.buildSummaryText', () => {
  const service = Object.create(TasteService.prototype) as TasteService;

  it('includes Spotify signals and hard anti-AI guidance', () => {
    const text = service.buildSummaryText({
      displayName: 'Alex',
      genres: ['deep house', 'jazz'],
      topArtists: [{ name: 'Moodymann', genres: ['house'] }],
      topTracks: [{ name: 'Dem Young Lights', artist: 'Moodymann' }],
    });
    expect(text).toContain('Alex');
    expect(text).toContain('deep house');
    expect(text).toContain('Moodymann');
    expect(text.toLowerCase()).toContain('never ai-generated');
  });
});
