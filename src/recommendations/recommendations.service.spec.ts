import { looksLikeAiGeneratedMusic } from '../common/anti-ai-music';
import { RecommendationsService } from './recommendations.service';

describe('RecommendationsService', () => {
  it('filters AI-looking catalog hits before returning recommendations', async () => {
    const tasteService = {
      getEmbeddingForUser: jest.fn().mockResolvedValue({
        embedding: [1, 0],
        summaryText: 'taste',
        genres: ['house'],
        topArtists: [{ name: 'Moodymann', genres: ['house'] }],
        topTracks: [],
      }),
    };
    const recordsService = {
      semanticSearch: jest.fn().mockResolvedValue([
        {
          _id: 'ai1',
          title: 'Neon Dreams',
          artist: 'Suno Studio',
          label: 'Fake',
          genre: ['Electronic'],
          price: 10,
          stock: 1,
          similarity: 0.99,
        },
        {
          _id: 'human1',
          title: 'Dem Young Lights',
          artist: 'Moodymann',
          label: 'KDJ',
          genre: ['House'],
          price: 25,
          stock: 2,
          similarity: 0.8,
        },
      ]),
    };

    const service = new RecommendationsService(tasteService as never, recordsService as never);
    const result = await service.recommendForUser('user1', 5);

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].artist).toBe('Moodymann');
    expect(result.recommendations[0].whyItFits.join(' ').toLowerCase()).toContain('human-made');
    expect(looksLikeAiGeneratedMusic(result.recommendations[0])).toBe(false);
    expect(result.policy.toLowerCase()).toContain('ai-generated');
  });
});
