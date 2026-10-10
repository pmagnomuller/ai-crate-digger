import { Injectable } from '@nestjs/common';
import { RecordsService, SemanticSearchHit } from '../records/records.service';
import { TasteService } from '../taste/taste.service';
import { looksLikeAiGeneratedMusic } from '../common/anti-ai-music';

export type TasteRecommendation = {
  id: string;
  title: string;
  artist: string;
  label: string;
  genre: string[];
  price: number;
  stock: number;
  similarity: number;
  whyItFits: string[];
};

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly tasteService: TasteService,
    private readonly recordsService: RecordsService,
  ) {}

  async recommendForUser(userId: string, limit = 8): Promise<{
    sourcePlatform: string;
    policy: string;
    recommendations: TasteRecommendation[];
  }> {
    const taste = await this.tasteService.getEmbeddingForUser(userId);
    // Over-fetch so denylist filtering still yields `limit` human picks.
    const hits = await this.recordsService.semanticSearch(taste.embedding, {
      limit: Math.max(limit * 3, 12),
    });

    const filtered = hits.filter((hit) => !looksLikeAiGeneratedMusic(hit));
    const recommendations = filtered.slice(0, limit).map((hit) =>
      this.toRecommendation(hit, taste),
    );

    return {
      sourcePlatform: 'spotify',
      policy: 'Never recommend AI-generated music. Results are grounded in the vinyl catalog and your Spotify taste embedding.',
      recommendations,
    };
  }

  private toRecommendation(
    hit: SemanticSearchHit,
    taste: {
      genres: string[];
      topArtists: Array<{ name: string; genres: string[] }>;
      topTracks: Array<{ name: string; artist: string }>;
      summaryText: string;
    },
  ): TasteRecommendation {
    const why: string[] = [];
    const recordGenres = (hit.genre ?? []).map((g) => g.toLowerCase());
    const overlappingGenres = taste.genres.filter((g) =>
      recordGenres.some((rg) => rg.includes(g) || g.includes(rg)),
    );
    if (overlappingGenres.length) {
      why.push(`Overlaps your Spotify genres: ${overlappingGenres.slice(0, 3).join(', ')}`);
    }

    const artistNames = new Set(taste.topArtists.map((a) => a.name.toLowerCase()));
    if (artistNames.has(hit.artist.toLowerCase())) {
      why.push(`Matches a top Spotify artist: ${hit.artist}`);
    } else {
      const related = taste.topArtists.find((a) =>
        (a.genres ?? []).some((g) => recordGenres.some((rg) => rg.includes(g.toLowerCase()))),
      );
      if (related) {
        why.push(`Adjacent to ${related.name} in your listening graph`);
      }
    }

    if (!why.length) {
      why.push('Closest semantic match to your Spotify taste embedding in the human vinyl catalog');
    }
    why.push('Human-made catalog release (AI-generated music excluded)');

    return {
      id: String((hit as { _id?: unknown })._id ?? ''),
      title: hit.title,
      artist: hit.artist,
      label: hit.label,
      genre: hit.genre ?? [],
      price: hit.price,
      stock: hit.stock,
      similarity: hit.similarity,
      whyItFits: why,
    };
  }
}
