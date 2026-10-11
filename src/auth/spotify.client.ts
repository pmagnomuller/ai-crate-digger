import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
};

export type SpotifyProfile = {
  id: string;
  display_name?: string;
  email?: string;
};

export type SpotifyTopArtist = {
  id: string;
  name: string;
  genres: string[];
};

export type SpotifyTopTrack = {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
};

@Injectable()
export class SpotifyClient {
  private readonly http: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    this.http = axios.create({ timeout: 15_000 });
  }

  isConfigured(): boolean {
    const id = this.configService.get<string>('spotify.clientId');
    const secret = this.configService.get<string>('spotify.clientSecret');
    const redirect = this.configService.get<string>('spotify.redirectUri');
    return Boolean(id && secret && redirect);
  }

  private requireConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Spotify OAuth is not configured. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI.',
      );
    }
    return {
      clientId: this.configService.getOrThrow<string>('spotify.clientId'),
      clientSecret: this.configService.getOrThrow<string>('spotify.clientSecret'),
      redirectUri: this.configService.getOrThrow<string>('spotify.redirectUri'),
    };
  }

  buildAuthorizeUrl(state: string): string {
    const { clientId, redirectUri } = this.requireConfig();
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      scope: ['user-read-email', 'user-read-private', 'user-top-read'].join(' '),
    });
    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<SpotifyTokenResponse> {
    const { clientId, clientSecret, redirectUri } = this.requireConfig();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
    const { data } = await this.http.post<SpotifyTokenResponse>(
      'https://accounts.spotify.com/api/token',
      body.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
      },
    );
    return data;
  }

  async refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
    const { clientId, clientSecret } = this.requireConfig();
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const { data } = await this.http.post<SpotifyTokenResponse>(
      'https://accounts.spotify.com/api/token',
      body.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
      },
    );
    return data;
  }

  async getProfile(accessToken: string): Promise<SpotifyProfile> {
    const { data } = await this.http.get<SpotifyProfile>('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return data;
  }

  async getTopArtists(accessToken: string, limit = 20): Promise<SpotifyTopArtist[]> {
    const { data } = await this.http.get<{ items: SpotifyTopArtist[] }>(
      'https://api.spotify.com/v1/me/top/artists',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { limit, time_range: 'medium_term' },
      },
    );
    return data.items ?? [];
  }

  async getTopTracks(accessToken: string, limit = 20): Promise<SpotifyTopTrack[]> {
    const { data } = await this.http.get<{ items: SpotifyTopTrack[] }>(
      'https://api.spotify.com/v1/me/top/tracks',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { limit, time_range: 'medium_term' },
      },
    );
    return data.items ?? [];
  }
}
