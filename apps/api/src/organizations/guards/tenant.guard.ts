import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly databaseService: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    if (!request.user) {
      throw new UnauthorizedException('Authentication required before tenant resolution.');
    }

    // 1. Extract candidate organization identifier from route param or trusted header
    const paramOrgId = request.params?.organizationId;
    const headerOrgId = request.headers['x-organization-id'] as string | undefined;

    const orgIdCandidate = paramOrgId || (headerOrgId ? headerOrgId.trim() : null);

    if (!orgIdCandidate) {
      throw new BadRequestException(
        'Tenant context missing. Specify organizationId in route parameter or x-organization-id header.',
      );
    }

    // 2. Authoritative lookup: NEVER trust unverified organization context
    const membership =
      await this.databaseService.client.organizationMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgIdCandidate,
            userId: request.user.id,
          },
        },
        include: {
          organization: true,
        },
      });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: You do not belong to the requested organization.',
      );
    }

    // 3. Attach trusted tenant context to request lifecycle
    request.organization = membership.organization;
    request.membership = membership;

    return true;
  }
}
