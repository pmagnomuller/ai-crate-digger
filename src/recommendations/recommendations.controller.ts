import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserDocument } from '../auth/schemas/user.schema';
import { RecommendationsService } from './recommendations.service';

@Controller('recommendations')
@UseGuards(AuthGuard)
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Get()
  recommend(
    @CurrentUser() user: UserDocument,
    @Query('limit', new DefaultValuePipe(8), ParseIntPipe) limit: number,
  ) {
    const capped = Math.min(Math.max(limit, 1), 20);
    return this.recommendationsService.recommendForUser(String(user._id), capped);
  }
}
