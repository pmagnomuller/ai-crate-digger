import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import configuration from './config/configuration';
import { RecordsModule } from './records/records.module';
import { SeedModule } from './seed/seed.module';
import { AiModule } from './ai/ai.module';
import { ChatModule } from './chat/chat.module';
import { TtsModule } from './tts/tts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('mongoUri'),
      }),
    }),
    RecordsModule,
    SeedModule,
    AiModule,
    ChatModule,
    TtsModule,
  ],
})
export class AppModule {}
