import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Organization } from '@impactra/database';

export const CurrentOrganization = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Organization => {
    const request = ctx.switchToHttp().getRequest();
    return request.organization;
  },
);
