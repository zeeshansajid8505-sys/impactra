import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { OrganizationMembership } from '@impactra/database';

export const CurrentMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrganizationMembership => {
    const request = ctx.switchToHttp().getRequest();
    return request.membership;
  },
);
