import { Injectable } from '@nestjs/common';
import { RecordEntity } from '../../records/schemas/record.schema';

type DiscogsRelease = {
  id: number;
  title: string;
  genre?: string[];
  label?: string[];
  year?: number;
};

@Injectable()
export class DiscogsToRecordMapper {
  map(input: DiscogsRelease): Partial<RecordEntity> {
    const [artist, title] = input.title.includes(' - ')
      ? input.title.split(' - ', 2)
      : ['Unknown Artist', input.title];

    return {
      discogsId: input.id,
      artist: artist.trim(),
      title: title.trim(),
      genre: input.genre ?? ['Unknown'],
      bpm: this.estimateBpm(input.genre),
      label: input.label?.[0] ?? 'Unknown Label',
      price: this.estimatePrice(input.year),
      stock: Math.floor(Math.random() * 10) + 1,
      notes: 'Imported from Discogs seed',
    };
  }

  private estimateBpm(genres?: string[]): number | undefined {
    if (!genres?.length) return undefined;
    const lower = genres.join(' ').toLowerCase();
    if (lower.includes('house')) return 124;
    if (lower.includes('techno')) return 132;
    if (lower.includes('jazz')) return 102;
    if (lower.includes('hip hop')) return 92;
    return 118;
  }

  private estimatePrice(year?: number): number {
    if (!year) return 19.99;
    if (year < 1980) return 34.99;
    if (year < 2000) return 24.99;
    return 18.99;
  }
}
