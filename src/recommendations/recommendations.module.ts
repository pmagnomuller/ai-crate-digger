import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RecordsModule } from '../records/records.module';
import { TasteModule } from '../taste/taste.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [AuthModule, TasteModule, RecordsModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
