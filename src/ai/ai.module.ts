import { Module } from '@nestjs/common';
import { RecordsModule } from '../records/records.module';
import { EmbeddingsModule } from './embeddings.module';
import { OrchestratorService } from './orchestrator.service';
import { SearchRecordsTool } from './tools/search-records.tool';
import { GetPriceTool } from './tools/get-price.tool';
import { CheckAvailabilityTool } from './tools/check-availability.tool';
import { GetRecordDetailTool } from './tools/get-record-detail.tool';

@Module({
  imports: [RecordsModule, EmbeddingsModule],
  providers: [
    OrchestratorService,
    SearchRecordsTool,
    GetRecordDetailTool,
    GetPriceTool,
    CheckAvailabilityTool,
  ],
  exports: [EmbeddingsModule, OrchestratorService, SearchRecordsTool, GetRecordDetailTool],
})
export class AiModule {}
