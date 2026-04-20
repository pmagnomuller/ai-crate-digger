import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { createAzureOpenAIClient } from './azure-openai.client';

@Injectable()
export class EmbeddingsService {
  private readonly client: OpenAI;
  private readonly deployment: string;

  constructor(private readonly configService: ConfigService) {
    this.client = createAzureOpenAIClient(configService);
    this.deployment = this.configService.getOrThrow<string>(
      'azureOpenAI.embeddingsDeployment',
    );
  }

  async embedText(input: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.deployment,
      input,
    });
    return response.data[0]?.embedding ?? [];
  }
}
