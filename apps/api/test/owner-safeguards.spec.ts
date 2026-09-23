import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MembershipsService } from '../src/memberships/memberships.service';
import { DatabaseService } from '../src/database/database.service';
import { TokenService } from '../src/auth/services/token.service';

describe('OwnerSafeguards', () => {
  let service: MembershipsService;
  let dbMock: any;
  let tokenServiceMock: any;

  beforeEach(() => {
    dbMock = {
      client: {
        organizationMembership: {
          findMany: jest.fn(),
          findUnique: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
          count: jest.fn(),
        },
        user: {
          findUnique: jest.fn(),
        },
        organizationInvitation: {
          deleteMany: jest.fn(),
          create: jest.fn(),
        },
      },
    };
    tokenServiceMock = {
      generateOpaqueToken: jest.fn().mockReturnValue('mock-token'),
      hashToken: jest.fn().mockReturnValue('mock-hash'),
    };

    service = new MembershipsService(
      dbMock as DatabaseService,
      tokenServiceMock as TokenService,
    );
  });

  describe('updateMemberRole safeguards', () => {
    it('should prevent demoting the last OWNER', async () => {
      dbMock.client.organizationMembership.findUnique.mockResolvedValue({
        id: 'mem-1',
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'OWNER',
      });
      // Only 1 owner remaining
      dbMock.client.organizationMembership.count.mockResolvedValue(1);

      await expect(
        service.updateMemberRole(
          'org-1',
          'mem-1',
          { userId: 'user-1', role: 'OWNER' },
          'ADMIN',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent self-promotion to OWNER by non-owner', async () => {
      dbMock.client.organizationMembership.findUnique.mockResolvedValue({
        id: 'mem-2',
        organizationId: 'org-1',
        userId: 'user-2',
        role: 'ADMIN',
      });

      await expect(
        service.updateMemberRole(
          'org-1',
          'mem-2',
          { userId: 'user-2', role: 'ADMIN' },
          'OWNER',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent an ADMIN from modifying the role of an OWNER', async () => {
      dbMock.client.organizationMembership.findUnique.mockResolvedValue({
        id: 'mem-1',
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'OWNER',
      });

      await expect(
        service.updateMemberRole(
          'org-1',
          'mem-1',
          { userId: 'user-admin', role: 'ADMIN' },
          'DEVELOPER',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject modification of membership belonging to a different organization (cross-tenant)', async () => {
      dbMock.client.organizationMembership.findUnique.mockResolvedValue({
        id: 'mem-other',
        organizationId: 'org-other',
        userId: 'user-3',
        role: 'DEVELOPER',
      });

      await expect(
        service.updateMemberRole(
          'org-1',
          'mem-other',
          { userId: 'user-1', role: 'OWNER' },
          'ADMIN',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMember safeguards', () => {
    it('should prevent removing the last remaining OWNER', async () => {
      dbMock.client.organizationMembership.findUnique.mockResolvedValue({
        id: 'mem-1',
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'OWNER',
      });
      dbMock.client.organizationMembership.count.mockResolvedValue(1);

      await expect(
        service.removeMember('org-1', 'mem-1', {
          userId: 'user-1',
          role: 'OWNER',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent an ADMIN from removing an OWNER', async () => {
      dbMock.client.organizationMembership.findUnique.mockResolvedValue({
        id: 'mem-1',
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'OWNER',
      });

      await expect(
        service.removeMember('org-1', 'mem-1', {
          userId: 'user-admin',
          role: 'ADMIN',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
