import { Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard, AuthedRequest } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('spotify/status')
  status() {
    return {
      configured: this.authService.isSpotifyConfigured(),
      platform: 'spotify' as const,
    };
  }

  @Get('spotify/login')
  login(@Res() res: Response): void {
    const { authorizeUrl } = this.authService.beginSpotifyLogin();
    res.redirect(302, authorizeUrl);
  }

  @Get('spotify/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (error) {
      res.redirect(302, this.authService.clientRedirectUrl(`/?authError=${encodeURIComponent(error)}`));
      return;
    }
    try {
      const { sessionToken } = await this.authService.completeSpotifyLogin(code, state);
      res.setHeader('Set-Cookie', this.authService.buildSessionCookie(sessionToken));
      res.redirect(302, this.authService.clientRedirectUrl('/?connected=spotify'));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'oauth_failed';
      res.redirect(
        302,
        this.authService.clientRedirectUrl(`/?authError=${encodeURIComponent(message)}`),
      );
    }
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: AuthedRequest) {
    return this.authService.toPublicUser(req.user!);
  }

  @Post('logout')
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const token =
      this.authService.parseSessionCookie(req.headers.cookie) ??
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice('Bearer '.length).trim()
        : undefined);
    await this.authService.logout(token);
    res.setHeader('Set-Cookie', this.authService.clearSessionCookie());
    return { ok: true };
  }
}
