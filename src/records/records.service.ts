import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmbeddingsService } from '../ai/embeddings.service';
import { RecordDocument, RecordEntity } from './schemas/record.schema';
import { SearchRecordsDto } from './dto/search-records.dto';

/** Catalog row (without vector) plus dot-product similarity vs. the query embedding (higher is closer). */
export type SemanticSearchHit = Omit<RecordEntity, 'embedding'> & { similarity: number };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class RecordsService {
  constructor(
    @InjectModel(RecordEntity.name)
    private readonly recordModel: Model<RecordDocument>,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  /**
   * Embed `dto.query`, rank by dot product against stored vectors, optional genre/label filters.
   * Only documents with a non-empty `embedding` are considered.
   */
  async search(dto: SearchRecordsDto): Promise<SemanticSearchHit[]> {
    const text = dto.query?.trim();
    if (!text) {
      throw new BadRequestException('query must be a non-empty string');
    }
    const embedding = await this.embeddingsService.embedText(text);
    if (!embedding.length) {
      throw new BadRequestException('Could not produce an embedding for the query');
    }
    return this.semanticSearch(embedding, dto);
  }

  async semanticSearch(
    queryEmbedding: number[],
    dto: Pick<SearchRecordsDto, 'genres' | 'label' | 'limit'>,
  ): Promise<SemanticSearchHit[]> {
    const matchStage: Record<string, unknown> = {};
    if (dto.genres?.length) {
      // Case-insensitive match against any element in the `genre` array.
      matchStage.genre = { $in: dto.genres.map((g) => new RegExp(`^${escapeRegex(g)}$`, 'i')) };
    }
    if (dto.label) matchStage.label = new RegExp(dto.label, 'i');
    const pipeline: Record<string, unknown>[] = [];
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }
    pipeline.push({
      $match: { embedding: { $exists: true, $ne: [] } },
    });
    pipeline.push({
      $addFields: {
        similarity: {
          $reduce: {
            input: { $range: [0, { $size: '$embedding' }] },
            initialValue: 0,
            in: {
              $add: [
                '$$value',
                {
                  $multiply: [
                    { $arrayElemAt: ['$embedding', '$$this'] },
                    { $arrayElemAt: [queryEmbedding, '$$this'] },
                  ],
                },
              ],
            },
          },
        },
      },
    });
    pipeline.push({ $sort: { similarity: -1 } });
    pipeline.push({ $limit: dto.limit ?? 10 });
    pipeline.push({ $project: { embedding: 0 } });
    return this.recordModel.aggregate<SemanticSearchHit>(pipeline as never[]);
  }

  async getPrice(recordId: string): Promise<{ price: number | null }> {
    const record = await this.recordModel.findById(recordId).lean();
    return { price: record?.price ?? null };
  }

  async checkAvailability(recordId: string): Promise<{ stock: number }> {
    const record = await this.recordModel.findById(recordId).lean();
    return { stock: record?.stock ?? 0 };
  }

  /**
   * Full record for LLM / detail tool — omits embedding vector to save tokens.
   */
  async findRecordDetailById(recordId: string): Promise<Record<string, unknown> | null> {
    const doc = await this.recordModel.findById(recordId).lean();
    if (!doc) return null;
    const raw = doc as unknown as Record<string, unknown> & { embedding?: number[] };
    const { embedding: _e, ...rest } = raw;
    return { ...rest, _id: String(raw._id) };
  }

  async upsertMany(records: Partial<RecordEntity>[]): Promise<void> {
    if (!records.length) return;
    const ops = records
      .filter((record) => typeof record.discogsId === 'number')
      .map((record) => ({
        updateOne: {
          filter: { discogsId: record.discogsId },
          update: { $set: record },
          upsert: true,
        },
      }));
    if (ops.length) await this.recordModel.bulkWrite(ops);
  }
}
