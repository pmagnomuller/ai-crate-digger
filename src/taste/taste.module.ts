import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { EmbeddingsModule } from '../ai/embeddings.module';
import { TasteProfileEntity, TasteProfileSchema } from './schemas/taste-profile.schema';
import { TasteController } from './taste.controller';
import { TasteService } from './taste.service';

@Module({
  imports: [
    AuthModule,
    EmbeddingsModule,
    MongooseModule.forFeature([{ name: TasteProfileEntity.name, schema: TasteProfileSchema }]),
  ],
  controllers: [TasteController],
  providers: [TasteService],
  exports: [TasteService],
})
export class TasteModule {}
