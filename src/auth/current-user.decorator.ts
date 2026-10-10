import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthedRequest } from './auth.guard';
import { UserDocument } from './schemas/user.schema';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserDocument => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) {
      throw new Error('CurrentUser used without AuthGuard');
    }
    return req.user;
  },
);
