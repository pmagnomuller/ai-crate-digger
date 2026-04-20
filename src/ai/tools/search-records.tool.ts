import { Injectable } from '@nestjs/common';
import { RecordsService, SemanticSearchHit } from '../../records/records.service';
import { EmbeddingsService } from '../embeddings.service';

@Injectable()
export class SearchRecordsTool {
  constructor(
    private readonly recordsService: RecordsService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  async run(args: {
    query: string;
    /** Single-genre hint; combined with query/vibe for embedding — NOT a hard filter. */
    genre?: string;
    vibe?: string;
    /**
     * Hard filters from the API caller. The model's `genre` hint is intentionally NOT
     * turned into a $match here — Discogs genres are broad/title-cased (e.g. `Electronic`)
     * while the model often passes narrower styles (e.g. `house`), which would zero out
     * results. Similarity + the embedded hint are enough for ranking.
     */
    constraints?: { genres?: string[]; label?: string; limit?: number };
  }): Promise<SemanticSearchHit[]> {
    const embedding = await this.embeddingsService.embedText(
      `${args.query} ${args.vibe ?? ''} ${args.genre ?? ''}`.trim(),
    );
    return this.recordsService.semanticSearch(embedding, {
      genres: args.constraints?.genres,
      label: args.constraints?.label,
      limit: args.constraints?.limit ?? 6,
    });
  }
}
