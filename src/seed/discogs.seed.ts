import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import configuration from '../config/configuration';
import { RecordsModule } from '../records/records.module';
import { RecordsService } from '../records/records.service';
import { DiscogsClient } from './discogs.client';
import { DiscogsToRecordMapper } from './mappers/discogs-to-record.mapper';
import { EmbeddingsModule } from '../ai/embeddings.module';
import { EmbeddingsService } from '../ai/embeddings.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('mongoUri'),
      }),
    }),
    EmbeddingsModule,
    RecordsModule,
  ],
  providers: [DiscogsClient, DiscogsToRecordMapper],
})
class SeedRunnerModule {}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === 'replace_me' ||
    normalized.includes('your-resource.openai.azure.com')
  );
}

function parseBooleanEnv(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

async function seedDiscogs(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SeedRunnerModule);

  const logger = new Logger('DiscogsSeed');
  const config = app.get(ConfigService);
  const target = config.get<number>('discogsSeedTarget') ?? 200;
  const skipEmbeddings = parseBooleanEnv(process.env.DISCOGS_SKIP_EMBEDDINGS);
  const client = app.get(DiscogsClient);
  const mapper = app.get(DiscogsToRecordMapper);
  const recordsService = app.get(RecordsService);
  const embeddingsService = app.get(EmbeddingsService);
  const discogsToken = config.get<string>('discogsToken');
  const azureEndpoint = config.get<string>('azureOpenAI.endpoint');
  const azureApiKey = config.get<string>('azureOpenAI.apiKey');

  if (isPlaceholder(discogsToken)) {
    throw new Error(
      'DISCOGS_USER_TOKEN is missing or still set to a placeholder. Update .env with a real Discogs user token.',
    );
  }

  if (!skipEmbeddings && (isPlaceholder(azureEndpoint) || isPlaceholder(azureApiKey))) {
    throw new Error(
      'Azure OpenAI configuration is missing or placeholder values are still in .env. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY, or run with DISCOGS_SKIP_EMBEDDINGS=true for a low-cost seed.',
    );
  }

  if (skipEmbeddings) {
    logger.warn(
      'DISCOGS_SKIP_EMBEDDINGS=true -> embeddings will not be generated for seeded records.',
    );
  }

  const collected: Array<Record<string, unknown>> = [];
  let page = 1;
  while (collected.length < target) {
    const batch = await client.fetchReleases(page, 50);
    if (!batch.length) break;
    for (const release of batch) {
      if (collected.length >= target) break;
      const mapped = mapper.map(release);
      if (skipEmbeddings) {
        collected.push({ ...mapped, embedding: [] });
      } else {
        const embeddingText = `${mapped.artist} ${mapped.title} ${mapped.genre?.join(' ') ?? ''} ${mapped.label}`;
        const embedding = await embeddingsService.embedText(embeddingText);
        collected.push({ ...mapped, embedding });
      }
    }
    page += 1;
  }

  await recordsService.upsertMany(collected as never[]);
  logger.log(`Seeded ${collected.length} records from Discogs`);
  await app.close();
}

void seedDiscogs();
