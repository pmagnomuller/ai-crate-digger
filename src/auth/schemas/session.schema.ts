import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SessionDocument = HydratedDocument<SessionEntity>;

@Schema({ timestamps: true, collection: 'sessions' })
export class SessionEntity {
  @Prop({ required: true, unique: true, index: true })
  token!: string;

  @Prop({ type: Types.ObjectId, ref: 'UserEntity', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  expiresAt!: Date;
}

export const SessionSchema = SchemaFactory.createForClass(SessionEntity);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
