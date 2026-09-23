import { ExecutionContext, ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { TenantGuard } from '../src/organizations/guards/tenant.guard';
import { DatabaseService } from '../src/database/database.service';

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let databaseServiceMock: any;

  beforeEach(() => {
    databaseServiceMock = {
      client: {
        organizationMembership: {
          findUnique: jest.fn(),
        },
      },
    };
    guard = new TenantGuard(databaseServiceMock as DatabaseService);
  });

  const createMockContext = (req: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext);

  it('should throw UnauthorizedException if user is not authenticated', async () => {
    const ctx = createMockContext({ user: null });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw BadRequestException if neither organizationId param nor header is provided', async () => {
    const ctx = createMockContext({
      user: { id: 'user-1' },
      params: {},
      headers: {},
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
  });

  it('should throw ForbiddenException if user does not belong to the organization', async () => {
    databaseServiceMock.client.organizationMembership.findUnique.mockResolvedValue(null);

    const ctx = createMockContext({
      user: { id: 'user-1' },
      params: { organizationId: 'org-alien' },
      headers: {},
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(
      databaseServiceMock.client.organizationMembership.findUnique,
    ).toHaveBeenCalledWith({
      where: {
        organizationId_userId: {
          organizationId: 'org-alien',
          userId: 'user-1',
        },
      },
      include: { organization: true },
    });
  });

  it('should attach trusted organization and membership when verified', async () => {
    const mockOrg = { id: 'org-trusted', name: 'Acme', slug: 'acme' };
    const mockMembership = {
      id: 'membership-1',
      organizationId: 'org-trusted',
      userId: 'user-1',
      role: 'ADMIN',
      organization: mockOrg,
    };

    databaseServiceMock.client.organizationMembership.findUnique.mockResolvedValue(
      mockMembership,
    );

    const req: any = {
      user: { id: 'user-1' },
      params: {},
      headers: { 'x-organization-id': 'org-trusted' },
    };
    const ctx = createMockContext(req);

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(req.organization).toEqual(mockOrg);
    expect(req.membership).toEqual(mockMembership);
  });
});
