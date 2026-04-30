import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CurrentUser as ICurrentUser } from '../interfaces/current-user.interface';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ICurrentUser => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const request = ctx.switchToHttp().getRequest();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return request.user as ICurrentUser;
  },
);
