import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { SessionEntity, SessionSchema } from './schemas/session.schema';
import { UserEntity, UserSchema } from './schemas/user.schema';
import { SpotifyClient } from './spotify.client';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserEntity.name, schema: UserSchema },
      { name: SessionEntity.name, schema: SessionSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, SpotifyClient, AuthGuard],
  exports: [AuthService, SpotifyClient, AuthGuard, MongooseModule],
})
export class AuthModule {}
