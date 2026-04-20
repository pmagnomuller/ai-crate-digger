import { Module } from '@nestjs/common';
import { RecordsModule } from '../records/records.module';
import { AiModule } from '../ai/ai.module';
import { DiscogsClient } from './discogs.client';
import { DiscogsToRecordMapper } from './mappers/discogs-to-record.mapper';

@Module({
  imports: [RecordsModule, AiModule],
  providers: [DiscogsClient, DiscogsToRecordMapper],
  exports: [DiscogsClient, DiscogsToRecordMapper],
})
export class SeedModule {}
