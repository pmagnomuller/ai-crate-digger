import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserDocument } from '../auth/schemas/user.schema';
import { TasteService } from './taste.service';

@Controller('taste')
@UseGuards(AuthGuard)
export class TasteController {
  constructor(private readonly tasteService: TasteService) {}

  @Get()
  get(@CurrentUser() user: UserDocument) {
    return this.tasteService.getForUser(String(user._id));
  }

  @Post('sync')
  sync(@CurrentUser() user: UserDocument) {
    return this.tasteService.syncFromSpotify(user);
  }
}
