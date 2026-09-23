import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { Permission } from '../permissions.enum';
import { hasAllPermissions } from '../permissions.policy';
import { MembershipDto } from '@impactra/shared';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const membership: MembershipDto | undefined = request.membership;

    if (!membership) {
      throw new ForbiddenException(
        'Tenant context must be resolved before verifying permissions.',
      );
    }

    const authorized = hasAllPermissions(membership.role, requiredPermissions);
    if (!authorized) {
      throw new ForbiddenException(
        'You do not have the required permissions to perform this operation.',
      );
    }

    return true;
  }
}
