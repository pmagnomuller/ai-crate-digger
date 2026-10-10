import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TasteProfileDocument = HydratedDocument<TasteProfileEntity>;

@Schema({ _id: false })
export class TasteArtistSignal {
  @Prop({ required: true })
  name!: string;

  @Prop({ type: [String], default: [] })
  genres!: string[];
}

@Schema({ _id: false })
export class TasteTrackSignal {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  artist!: string;
}

@Schema({ timestamps: true, collection: 'taste_profiles' })
export class TasteProfileEntity {
  @Prop({ type: Types.ObjectId, ref: 'UserEntity', required: true, unique: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, default: 'spotify' })
  sourcePlatform!: string;

  @Prop({ type: [String], default: [] })
  genres!: string[];

  @Prop({ type: [TasteArtistSignal], default: [] })
  topArtists!: TasteArtistSignal[];

  @Prop({ type: [TasteTrackSignal], default: [] })
  topTracks!: TasteTrackSignal[];

  /** Human-readable summary used as the embedding source text. */
  @Prop({ required: true })
  summaryText!: string;

  @Prop({ type: [Number], default: [] })
  embedding!: number[];

  @Prop()
  embeddingModel?: string;

  @Prop()
  lastSyncedAt?: Date;
}

export const TasteProfileSchema = SchemaFactory.createForClass(TasteProfileEntity);
