import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

type DiscogsRelease = {
  id: number;
  title: string;
  genre?: string[];
  label?: string[];
  year?: number;
};

@Injectable()
export class DiscogsClient {
  private readonly client: AxiosInstance;
  private readonly token: string;

  constructor(private readonly configService: ConfigService) {
    this.client = axios.create({
      baseURL: 'https://api.discogs.com',
      headers: {
        'User-Agent': 'AI-Crate-Digger/1.0',
      },
      timeout: 15000,
    });
    this.token = this.configService.getOrThrow<string>('discogsToken');
  }

  async fetchReleases(page: number, perPage = 50): Promise<DiscogsRelease[]> {
    const response = await this.client.get('/database/search', {
      params: {
        type: 'release',
        token: this.token,
        page,
        per_page: perPage,
      },
    });
    return response.data.results ?? [];
  }
}
