import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { UserDocument } from './schemas/user.schema';

export type AuthedRequest = Request & { user?: UserDocument; sessionToken?: string };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const fromCookie = this.authService.parseSessionCookie(req.headers.cookie);
    const fromHeader = this.bearerToken(req.headers.authorization);
    const sessionToken = fromCookie ?? fromHeader;
    try {
      const user = await this.authService.resolveUserFromSessionToken(sessionToken);
      req.user = user;
      req.sessionToken = sessionToken;
      return true;
    } catch {
      throw new UnauthorizedException('Not authenticated');
    }
  }

  private bearerToken(authorization: string | undefined): string | undefined {
    if (!authorization?.startsWith('Bearer ')) return undefined;
    return authorization.slice('Bearer '.length).trim() || undefined;
  }
}
