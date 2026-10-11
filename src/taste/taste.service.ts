import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { UserDocument } from '../auth/schemas/user.schema';
import { SpotifyClient } from '../auth/spotify.client';
import { EmbeddingsService } from '../ai/embeddings.service';
import { TasteProfileDocument, TasteProfileEntity } from './schemas/taste-profile.schema';

export type PublicTasteProfile = {
  userId: string;
  sourcePlatform: string;
  genres: string[];
  topArtists: Array<{ name: string; genres: string[] }>;
  topTracks: Array<{ name: string; artist: string }>;
  summaryText: string;
  hasEmbedding: boolean;
  lastSyncedAt?: string;
  updatedAt?: string;
};

@Injectable()
export class TasteService {
  constructor(
    @InjectModel(TasteProfileEntity.name)
    private readonly tasteModel: Model<TasteProfileDocument>,
    private readonly authService: AuthService,
    private readonly spotifyClient: SpotifyClient,
    private readonly embeddingsService: EmbeddingsService,
    private readonly configService: ConfigService,
  ) {}

  async getForUser(userId: string): Promise<PublicTasteProfile> {
    const doc = await this.tasteModel.findOne({ userId }).lean().exec();
    if (!doc) {
      throw new NotFoundException('Taste profile not found. Sync from Spotify first.');
    }
    return this.toPublic(doc as TasteProfileEntity & { updatedAt?: Date });
  }

  async syncFromSpotify(user: UserDocument): Promise<PublicTasteProfile> {
    const accessToken = await this.authService.getValidSpotifyAccessToken(user);
    const [artists, tracks] = await Promise.all([
      this.spotifyClient.getTopArtists(accessToken, 20),
      this.spotifyClient.getTopTracks(accessToken, 20),
    ]);

    const genreCounts = new Map<string, number>();
    for (const artist of artists) {
      for (const genre of artist.genres ?? []) {
        const key = genre.toLowerCase();
        genreCounts.set(key, (genreCounts.get(key) ?? 0) + 1);
      }
    }
    const genres = [...genreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([g]) => g);

    const topArtists = artists.slice(0, 15).map((a) => ({
      name: a.name,
      genres: a.genres ?? [],
    }));
    const topTracks = tracks.slice(0, 15).map((t) => ({
      name: t.name,
      artist: t.artists?.[0]?.name ?? 'Unknown',
    }));

    const summaryText = this.buildSummaryText({
      displayName: user.displayName,
      genres,
      topArtists,
      topTracks,
    });

    const embedding = await this.embeddingsService.embedText(summaryText);
    const embeddingModel = this.configService.get<string>('azureOpenAI.embeddingsDeployment');

    const doc = await this.tasteModel
      .findOneAndUpdate(
        { userId: user._id },
        {
          $set: {
            userId: user._id,
            sourcePlatform: 'spotify',
            genres,
            topArtists,
            topTracks,
            summaryText,
            embedding,
            embeddingModel,
            lastSyncedAt: new Date(),
          },
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    return this.toPublic(doc as TasteProfileEntity & { updatedAt?: Date });
  }

  async getEmbeddingForUser(userId: string): Promise<{
    embedding: number[];
    summaryText: string;
    genres: string[];
    topArtists: Array<{ name: string; genres: string[] }>;
    topTracks: Array<{ name: string; artist: string }>;
  }> {
    const doc = await this.tasteModel.findOne({ userId }).lean().exec();
    if (!doc || !doc.embedding?.length) {
      throw new NotFoundException('Taste profile embedding missing. Sync from Spotify first.');
    }
    return {
      embedding: doc.embedding,
      summaryText: doc.summaryText,
      genres: doc.genres ?? [],
      topArtists: doc.topArtists ?? [],
      topTracks: doc.topTracks ?? [],
    };
  }

  buildSummaryText(input: {
    displayName?: string;
    genres: string[];
    topArtists: Array<{ name: string; genres: string[] }>;
    topTracks: Array<{ name: string; artist: string }>;
  }): string {
    const who = input.displayName ? `${input.displayName}'s` : 'Listener';
    const genreLine = input.genres.length
      ? `Favorite genres: ${input.genres.join(', ')}.`
      : 'Genres: eclectic.';
    const artistLine = input.topArtists.length
      ? `Top artists: ${input.topArtists.map((a) => a.name).join(', ')}.`
      : '';
    const trackLine = input.topTracks.length
      ? `Recent favorite tracks: ${input.topTracks
          .map((t) => `${t.name} by ${t.artist}`)
          .join('; ')}.`
      : '';
    return [
      `${who} music taste profile from Spotify (human-made music only).`,
      genreLine,
      artistLine,
      trackLine,
      'Prefer physical vinyl and human-performed / human-composed releases. Never AI-generated music.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private toPublic(
    doc: TasteProfileEntity & { updatedAt?: Date; userId?: unknown },
  ): PublicTasteProfile {
    return {
      userId: String(doc.userId),
      sourcePlatform: doc.sourcePlatform,
      genres: doc.genres ?? [],
      topArtists: (doc.topArtists ?? []).map((a) => ({ name: a.name, genres: a.genres ?? [] })),
      topTracks: (doc.topTracks ?? []).map((t) => ({ name: t.name, artist: t.artist })),
      summaryText: doc.summaryText,
      hasEmbedding: Array.isArray(doc.embedding) && doc.embedding.length > 0,
      lastSyncedAt: doc.lastSyncedAt?.toISOString?.() ?? (doc.lastSyncedAt as unknown as string),
      updatedAt: doc.updatedAt?.toISOString?.(),
    };
  }
}
