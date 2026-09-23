import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Session } from '@impactra/database';

export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Session => {
    const request = ctx.switchToHttp().getRequest();
    return request.session;
  },
);
