import {
  ROLE_PERMISSIONS,
  hasPermission,
  hasAllPermissions,
} from '../src/authorization/permissions.policy';
import { Permission } from '../src/authorization/permissions.enum';
import { MembershipRole } from '@impactra/shared';

describe('PermissionsPolicy', () => {
  it('OWNER should possess all organizational administrative permissions', () => {
    expect(hasPermission('OWNER', Permission.ORGANIZATION_READ)).toBe(true);
    expect(hasPermission('OWNER', Permission.ORGANIZATION_UPDATE)).toBe(true);
    expect(hasPermission('OWNER', Permission.ORGANIZATION_DELETE)).toBe(true);
    expect(hasPermission('OWNER', Permission.MEMBERSHIP_READ)).toBe(true);
    expect(hasPermission('OWNER', Permission.MEMBERSHIP_INVITE)).toBe(true);
    expect(hasPermission('OWNER', Permission.MEMBERSHIP_ROLE_UPDATE)).toBe(true);
    expect(hasPermission('OWNER', Permission.MEMBERSHIP_REMOVE)).toBe(true);
  });

  it('ADMIN should possess member invite, read, and role update permissions', () => {
    expect(hasPermission('ADMIN', Permission.ORGANIZATION_READ)).toBe(true);
    expect(hasPermission('ADMIN', Permission.ORGANIZATION_UPDATE)).toBe(true);
    expect(hasPermission('ADMIN', Permission.MEMBERSHIP_READ)).toBe(true);
    expect(hasPermission('ADMIN', Permission.MEMBERSHIP_INVITE)).toBe(true);
    expect(hasPermission('ADMIN', Permission.MEMBERSHIP_ROLE_UPDATE)).toBe(true);
    expect(hasPermission('ADMIN', Permission.MEMBERSHIP_REMOVE)).toBe(true);
  });

  it('DEVELOPER and VIEWER should NOT possess member invite or role update permissions', () => {
    const roles: MembershipRole[] = [
      'DEVELOPER',
      'VIEWER',
      'QA_ENGINEER',
      'AUDITOR',
      'RELEASE_MANAGER',
      'ARCHITECT',
      'SECURITY_ENGINEER',
    ];

    for (const role of roles) {
      expect(hasPermission(role, Permission.MEMBERSHIP_INVITE)).toBe(false);
      expect(hasPermission(role, Permission.MEMBERSHIP_ROLE_UPDATE)).toBe(false);
      expect(hasPermission(role, Permission.MEMBERSHIP_REMOVE)).toBe(false);
      expect(hasPermission(role, Permission.ORGANIZATION_UPDATE)).toBe(false);
      // But they can read organization and membership details
      expect(hasPermission(role, Permission.ORGANIZATION_READ)).toBe(true);
      expect(hasPermission(role, Permission.MEMBERSHIP_READ)).toBe(true);
    }
  });

  it('hasAllPermissions should require every single listed permission', () => {
    expect(
      hasAllPermissions('OWNER', [
        Permission.ORGANIZATION_READ,
        Permission.MEMBERSHIP_INVITE,
      ]),
    ).toBe(true);

    expect(
      hasAllPermissions('DEVELOPER', [
        Permission.ORGANIZATION_READ,
        Permission.MEMBERSHIP_INVITE,
      ]),
    ).toBe(false);
  });
});
