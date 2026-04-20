import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmbeddingsModule } from '../ai/embeddings.module';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';
import { RecordEntity, RecordSchema } from './schemas/record.schema';

@Module({
  imports: [
    EmbeddingsModule,
    MongooseModule.forFeature([
      { name: RecordEntity.name, schema: RecordSchema },
    ]),
  ],
  controllers: [RecordsController],
  providers: [RecordsService],
  exports: [RecordsService],
})
export class RecordsModule {}
