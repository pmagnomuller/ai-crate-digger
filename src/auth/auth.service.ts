import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { Model } from 'mongoose';
import { SessionDocument, SessionEntity } from './schemas/session.schema';
import { UserDocument, UserEntity } from './schemas/user.schema';
import { SpotifyClient } from './spotify.client';

const SESSION_COOKIE = 'acd_session';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type OAuthStateEntry = { createdAt: number };

@Injectable()
export class AuthService {
  private readonly oauthStates = new Map<string, OAuthStateEntry>();

  constructor(
    @InjectModel(UserEntity.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(SessionEntity.name) private readonly sessionModel: Model<SessionDocument>,
    private readonly spotifyClient: SpotifyClient,
    private readonly configService: ConfigService,
  ) {}

  get sessionCookieName(): string {
    return SESSION_COOKIE;
  }

  isSpotifyConfigured(): boolean {
    return this.spotifyClient.isConfigured();
  }

  beginSpotifyLogin(): { authorizeUrl: string; state: string } {
    this.pruneOAuthStates();
    const state = randomBytes(24).toString('hex');
    this.oauthStates.set(state, { createdAt: Date.now() });
    return { authorizeUrl: this.spotifyClient.buildAuthorizeUrl(state), state };
  }

  async completeSpotifyLogin(code: string | undefined, state: string | undefined): Promise<{
    sessionToken: string;
    user: UserDocument;
  }> {
    if (!code || !state) {
      throw new BadRequestException('Missing Spotify OAuth code or state');
    }
    const entry = this.oauthStates.get(state);
    this.oauthStates.delete(state);
    if (!entry || Date.now() - entry.createdAt > OAUTH_STATE_TTL_MS) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const tokens = await this.spotifyClient.exchangeCode(code);
    const profile = await this.spotifyClient.getProfile(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const user = await this.userModel
      .findOneAndUpdate(
        { spotifyId: profile.id },
        {
          $set: {
            spotifyId: profile.id,
            displayName: profile.display_name,
            email: profile.email,
            spotifyAccessToken: tokens.access_token,
            ...(tokens.refresh_token ? { spotifyRefreshToken: tokens.refresh_token } : {}),
            spotifyTokenExpiresAt: expiresAt,
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    if (!user) {
      throw new UnauthorizedException('Could not create user');
    }

    const sessionToken = this.createSessionToken();
    await this.sessionModel.create({
      token: this.hashToken(sessionToken),
      userId: user._id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });

    return { sessionToken, user };
  }

  async resolveUserFromSessionToken(sessionToken: string | undefined): Promise<UserDocument> {
    if (!sessionToken) {
      throw new UnauthorizedException('Not authenticated');
    }
    const session = await this.sessionModel
      .findOne({ token: this.hashToken(sessionToken), expiresAt: { $gt: new Date() } })
      .exec();
    if (!session) {
      throw new UnauthorizedException('Session expired or invalid');
    }
    const user = await this.userModel.findById(session.userId).exec();
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  async logout(sessionToken: string | undefined): Promise<void> {
    if (!sessionToken) return;
    await this.sessionModel.deleteOne({ token: this.hashToken(sessionToken) }).exec();
  }

  /** Ensure access token is valid; refresh if needed. Returns a usable access token. */
  async getValidSpotifyAccessToken(user: UserDocument): Promise<string> {
    const now = Date.now();
    const expiresAt = user.spotifyTokenExpiresAt?.getTime() ?? 0;
    if (user.spotifyAccessToken && expiresAt > now + 60_000) {
      return user.spotifyAccessToken;
    }
    if (!user.spotifyRefreshToken) {
      throw new UnauthorizedException('Spotify re-connect required');
    }
    const tokens = await this.spotifyClient.refreshAccessToken(user.spotifyRefreshToken);
    user.spotifyAccessToken = tokens.access_token;
    if (tokens.refresh_token) {
      user.spotifyRefreshToken = tokens.refresh_token;
    }
    user.spotifyTokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await user.save();
    return user.spotifyAccessToken;
  }

  buildSessionCookie(sessionToken: string): string {
    const maxAge = Math.floor(SESSION_TTL_MS / 1000);
    const secure = this.configService.get<string>('nodeEnv') === 'production' ? '; Secure' : '';
    return `${SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  }

  clearSessionCookie(): string {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }

  clientRedirectUrl(path = '/'): string {
    const origin = this.configService.get<string>('clientOrigin') ?? 'http://127.0.0.1:5173';
    return new URL(path, origin).toString();
  }

  toPublicUser(user: UserDocument): {
    id: string;
    spotifyId: string;
    displayName?: string;
    email?: string;
  } {
    return {
      id: String(user._id),
      spotifyId: user.spotifyId,
      displayName: user.displayName,
      email: user.email,
    };
  }

  parseSessionCookie(cookieHeader: string | undefined): string | undefined {
    if (!cookieHeader) return undefined;
    for (const part of cookieHeader.split(';')) {
      const [rawKey, ...rest] = part.trim().split('=');
      if (rawKey === SESSION_COOKIE) {
        return rest.join('=') || undefined;
      }
    }
    return undefined;
  }

  private createSessionToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    const pepper = this.configService.get<string>('sessionSecret') ?? 'dev-session-secret';
    return createHash('sha256').update(`${pepper}:${token}`).digest('hex');
  }

  private pruneOAuthStates(): void {
    const cutoff = Date.now() - OAUTH_STATE_TTL_MS;
    for (const [key, value] of this.oauthStates) {
      if (value.createdAt < cutoff) this.oauthStates.delete(key);
    }
  }
}
