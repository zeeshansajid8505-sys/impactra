import { hasPermission, ROLE_PERMISSIONS } from './permissions.policy';
import { Permission } from './permissions.enum';
import { MembershipRole } from '@impactra/shared';

describe('RBAC Permissions Policy — Ingestion & Digital Twin Matrix', () => {
  const allRoles: MembershipRole[] = [
    'OWNER',
    'ADMIN',
    'ARCHITECT',
    'DEVELOPER',
    'RELEASE_MANAGER',
    'QA_ENGINEER',
    'SECURITY_ENGINEER',
    'AUDITOR',
    'VIEWER',
  ];

  describe('Permission.INGESTION_TRIGGER', () => {
    it('allows OWNER, ADMIN, ARCHITECT, DEVELOPER, RELEASE_MANAGER', () => {
      const allowedRoles: MembershipRole[] = [
        'OWNER',
        'ADMIN',
        'ARCHITECT',
        'DEVELOPER',
        'RELEASE_MANAGER',
      ];
      for (const role of allowedRoles) {
        expect(hasPermission(role, Permission.INGESTION_TRIGGER)).toBe(true);
      }
    });

    it('denies QA_ENGINEER, SECURITY_ENGINEER, AUDITOR, VIEWER', () => {
      const deniedRoles: MembershipRole[] = [
        'QA_ENGINEER',
        'SECURITY_ENGINEER',
        'AUDITOR',
        'VIEWER',
      ];
      for (const role of deniedRoles) {
        expect(hasPermission(role, Permission.INGESTION_TRIGGER)).toBe(false);
      }
    });
  });

  describe('Permission.INGESTION_READ and DIGITAL_TWIN_READ', () => {
    it('allows read access to all organization member roles', () => {
      for (const role of allRoles) {
        expect(hasPermission(role, Permission.INGESTION_READ)).toBe(true);
        expect(hasPermission(role, Permission.DIGITAL_TWIN_READ)).toBe(true);
      }
    });
  });
});
