import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RecordDocument = HydratedDocument<RecordEntity>;

@Schema({ timestamps: true, collection: 'records' })
export class RecordEntity {
  @Prop({ required: true, unique: true, index: true })
  discogsId!: number;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  artist!: string;

  @Prop({ type: [String], index: true })
  genre!: string[];

  @Prop()
  bpm?: number;

  @Prop({ required: true, index: true })
  label!: string;

  @Prop({ required: true })
  price!: number;

  @Prop({ required: true, default: 0 })
  stock!: number;

  @Prop()
  notes?: string;

  @Prop({ type: [Number], default: [] })
  embedding!: number[];
}

export const RecordSchema = SchemaFactory.createForClass(RecordEntity);
RecordSchema.index({ label: 1, genre: 1 });
