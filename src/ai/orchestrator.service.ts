import { Injectable } from '@nestjs/common';
import { SemanticSearchHit } from '../records/records.service';
import { CheckAvailabilityTool } from './tools/check-availability.tool';
import { GetPriceTool } from './tools/get-price.tool';
import { SearchRecordsTool } from './tools/search-records.tool';

@Injectable()
export class OrchestratorService {
  constructor(
    private readonly searchRecordsTool: SearchRecordsTool,
    private readonly getPriceTool: GetPriceTool,
    private readonly checkAvailabilityTool: CheckAvailabilityTool,
  ) {}

  async recommend(query: string): Promise<{
    records: SemanticSearchHit[];
    priceByRecordId: Record<string, number | null>;
    stockByRecordId: Record<string, number>;
  }> {
    const records = await this.searchRecordsTool.run({ query });
    const enrichmentJobs = records.map((record) => {
      const recordId = String((record as unknown as { _id: string })._id);
      return Promise.all([
        this.getPriceTool.run({ recordId }),
        this.checkAvailabilityTool.run({ recordId }),
      ]).then(([price, availability]) => ({
        recordId,
        price: price.price,
        stock: availability.stock,
      }));
    });
    const enriched = await Promise.all(enrichmentJobs);
    const priceByRecordId: Record<string, number | null> = {};
    const stockByRecordId: Record<string, number> = {};
    for (const item of enriched) {
      priceByRecordId[item.recordId] = item.price;
      stockByRecordId[item.recordId] = item.stock;
    }
    return { records, priceByRecordId, stockByRecordId };
  }
}
