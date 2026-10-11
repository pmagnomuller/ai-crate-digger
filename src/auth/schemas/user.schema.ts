import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<UserEntity>;

@Schema({ timestamps: true, collection: 'users' })
export class UserEntity {
  @Prop({ required: true, unique: true, index: true })
  spotifyId!: string;

  @Prop()
  displayName?: string;

  @Prop()
  email?: string;

  @Prop()
  spotifyAccessToken?: string;

  @Prop()
  spotifyRefreshToken?: string;

  @Prop()
  spotifyTokenExpiresAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(UserEntity);
