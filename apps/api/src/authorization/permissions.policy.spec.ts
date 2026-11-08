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

  describe('Permission.CHANGE_READ', () => {
    it('allows change read access to all organization member roles', () => {
      for (const role of allRoles) {
        expect(hasPermission(role, Permission.CHANGE_READ)).toBe(true);
      }
    });
  });

  describe('Permission.CHANGE_SYNC', () => {
    it('allows OWNER, ADMIN, ARCHITECT, DEVELOPER, RELEASE_MANAGER', () => {
      const allowedRoles: MembershipRole[] = [
        'OWNER',
        'ADMIN',
        'ARCHITECT',
        'DEVELOPER',
        'RELEASE_MANAGER',
      ];
      for (const role of allowedRoles) {
        expect(hasPermission(role, Permission.CHANGE_SYNC)).toBe(true);
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
        expect(hasPermission(role, Permission.CHANGE_SYNC)).toBe(false);
      }
    });
  });

  describe('Permission.BLAST_RADIUS_READ', () => {
    it('allows blast radius read access to all organization member roles', () => {
      for (const role of allRoles) {
        expect(hasPermission(role, Permission.BLAST_RADIUS_READ)).toBe(true);
      }
    });
  });

  describe('Permission.BLAST_RADIUS_ANALYZE', () => {
    it('allows OWNER, ADMIN, ARCHITECT, DEVELOPER, RELEASE_MANAGER', () => {
      const allowedRoles: MembershipRole[] = [
        'OWNER',
        'ADMIN',
        'ARCHITECT',
        'DEVELOPER',
        'RELEASE_MANAGER',
      ];
      for (const role of allowedRoles) {
        expect(hasPermission(role, Permission.BLAST_RADIUS_ANALYZE)).toBe(true);
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
        expect(hasPermission(role, Permission.BLAST_RADIUS_ANALYZE)).toBe(false);
      }
    });
  });

  describe('Permission.RELEASE_SAFETY_READ', () => {
    it('allows release safety read access to all organization member roles', () => {
      for (const role of allRoles) {
        expect(hasPermission(role, Permission.RELEASE_SAFETY_READ)).toBe(true);
      }
    });
  });

  describe('Permission.RELEASE_SAFETY_EVALUATE', () => {
    it('allows OWNER, ADMIN, ARCHITECT, DEVELOPER, RELEASE_MANAGER', () => {
      const allowedRoles: MembershipRole[] = [
        'OWNER',
        'ADMIN',
        'ARCHITECT',
        'DEVELOPER',
        'RELEASE_MANAGER',
      ];
      for (const role of allowedRoles) {
        expect(hasPermission(role, Permission.RELEASE_SAFETY_EVALUATE)).toBe(true);
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
        expect(hasPermission(role, Permission.RELEASE_SAFETY_EVALUATE)).toBe(false);
      }
    });
  });

  describe('Permission.GITHUB_CHECK_READ', () => {
    it('allows github check read access to all organization member roles', () => {
      for (const role of allRoles) {
        expect(hasPermission(role, Permission.GITHUB_CHECK_READ)).toBe(true);
      }
    });
  });

  describe('Permission.GITHUB_CHECK_PUBLISH', () => {
    it('allows OWNER, ADMIN, RELEASE_MANAGER', () => {
      const allowedRoles: MembershipRole[] = [
        'OWNER',
        'ADMIN',
        'RELEASE_MANAGER',
      ];
      for (const role of allowedRoles) {
        expect(hasPermission(role, Permission.GITHUB_CHECK_PUBLISH)).toBe(true);
      }
    });

    it('denies ARCHITECT, DEVELOPER, QA_ENGINEER, SECURITY_ENGINEER, AUDITOR, VIEWER', () => {
      const deniedRoles: MembershipRole[] = [
        'ARCHITECT',
        'DEVELOPER',
        'QA_ENGINEER',
        'SECURITY_ENGINEER',
        'AUDITOR',
        'VIEWER',
      ];
      for (const role of deniedRoles) {
        expect(hasPermission(role, Permission.GITHUB_CHECK_PUBLISH)).toBe(false);
      }
    });
  });

  describe('Permission.RELEASE_APPROVAL_READ', () => {
    it('allows release approval read access to all organization member roles', () => {
      for (const role of allRoles) {
        expect(hasPermission(role, Permission.RELEASE_APPROVAL_READ)).toBe(true);
      }
    });
  });

  describe('Permission.RELEASE_APPROVAL_REQUEST', () => {
    it('allows OWNER, ADMIN, ARCHITECT, SECURITY_ENGINEER, DEVELOPER, RELEASE_MANAGER, QA_ENGINEER', () => {
      const allowedRoles: MembershipRole[] = [
        'OWNER',
        'ADMIN',
        'ARCHITECT',
        'SECURITY_ENGINEER',
        'DEVELOPER',
        'RELEASE_MANAGER',
        'QA_ENGINEER',
      ];
      for (const role of allowedRoles) {
        expect(hasPermission(role, Permission.RELEASE_APPROVAL_REQUEST)).toBe(true);
      }
    });

    it('denies AUDITOR, VIEWER', () => {
      const deniedRoles: MembershipRole[] = ['AUDITOR', 'VIEWER'];
      for (const role of deniedRoles) {
        expect(hasPermission(role, Permission.RELEASE_APPROVAL_REQUEST)).toBe(false);
      }
    });
  });

  describe('Permission.RELEASE_APPROVAL_RESOLVE', () => {
    it('allows OWNER, ADMIN, RELEASE_MANAGER', () => {
      const allowedRoles: MembershipRole[] = [
        'OWNER',
        'ADMIN',
        'RELEASE_MANAGER',
      ];
      for (const role of allowedRoles) {
        expect(hasPermission(role, Permission.RELEASE_APPROVAL_RESOLVE)).toBe(true);
      }
    });

    it('denies ARCHITECT, DEVELOPER, QA_ENGINEER, SECURITY_ENGINEER, AUDITOR, VIEWER', () => {
      const deniedRoles: MembershipRole[] = [
        'ARCHITECT',
        'DEVELOPER',
        'QA_ENGINEER',
        'SECURITY_ENGINEER',
        'AUDITOR',
        'VIEWER',
      ];
      for (const role of deniedRoles) {
        expect(hasPermission(role, Permission.RELEASE_APPROVAL_RESOLVE)).toBe(false);
      }
    });
  });

  describe('Permission.RELEASE_APPROVAL_EXCEPTION', () => {
    it('allows OWNER, ADMIN', () => {
      const allowedRoles: MembershipRole[] = ['OWNER', 'ADMIN'];
      for (const role of allowedRoles) {
        expect(hasPermission(role, Permission.RELEASE_APPROVAL_EXCEPTION)).toBe(true);
      }
    });

    it('denies ARCHITECT, DEVELOPER, RELEASE_MANAGER, QA_ENGINEER, SECURITY_ENGINEER, AUDITOR, VIEWER', () => {
      const deniedRoles: MembershipRole[] = [
        'ARCHITECT',
        'DEVELOPER',
        'RELEASE_MANAGER',
        'QA_ENGINEER',
        'SECURITY_ENGINEER',
        'AUDITOR',
        'VIEWER',
      ];
      for (const role of deniedRoles) {
        expect(hasPermission(role, Permission.RELEASE_APPROVAL_EXCEPTION)).toBe(false);
      }
    });
  });
describe('Permission.RELEASE_POLICY_READ', () => {
    it('allows read access to all organization member roles', () => {
      for (const role of allRoles) {
        expect(hasPermission(role, Permission.RELEASE_POLICY_READ)).toBe(true);
      }
    });
  });

  describe('Permission.RELEASE_POLICY_CREATE', () => {
    it('allows OWNER, ADMIN, ARCHITECT, RELEASE_MANAGER', () => {
      const allowedRoles: MembershipRole[] = [
        'OWNER',
        'ADMIN',
        'ARCHITECT',
        'RELEASE_MANAGER',
      ];
      for (const role of allowedRoles) {
        expect(hasPermission(role, Permission.RELEASE_POLICY_CREATE)).toBe(true);
      }
    });

    it('denies DEVELOPER, SECURITY_ENGINEER, QA_ENGINEER, AUDITOR, VIEWER', () => {
      const deniedRoles: MembershipRole[] = [
        'DEVELOPER',
        'SECURITY_ENGINEER',
        'QA_ENGINEER',
        'AUDITOR',
        'VIEWER',
      ];
      for (const role of deniedRoles) {
        expect(hasPermission(role, Permission.RELEASE_POLICY_CREATE)).toBe(false);
      }
    });
  });

  describe('Permission.RELEASE_POLICY_UPDATE', () => {
    it('allows OWNER, ADMIN, ARCHITECT, RELEASE_MANAGER', () => {
      const allowedRoles: MembershipRole[] = [
        'OWNER',
        'ADMIN',
        'ARCHITECT',
        'RELEASE_MANAGER',
      ];
      for (const role of allowedRoles) {
        expect(hasPermission(role, Permission.RELEASE_POLICY_UPDATE)).toBe(true);
      }
    });

    it('denies DEVELOPER, SECURITY_ENGINEER, QA_ENGINEER, AUDITOR, VIEWER', () => {
      const deniedRoles: MembershipRole[] = [
        'DEVELOPER',
        'SECURITY_ENGINEER',
        'QA_ENGINEER',
        'AUDITOR',
        'VIEWER',
      ];
      for (const role of deniedRoles) {
        expect(hasPermission(role, Permission.RELEASE_POLICY_UPDATE)).toBe(false);
      }
    });
  });

  describe('Permission.RELEASE_POLICY_ACTIVATE', () => {
    it('allows OWNER, ADMIN, RELEASE_MANAGER', () => {
      const allowedRoles: MembershipRole[] = [
        'OWNER',
        'ADMIN',
        'RELEASE_MANAGER',
      ];
      for (const role of allowedRoles) {
        expect(hasPermission(role, Permission.RELEASE_POLICY_ACTIVATE)).toBe(true);
      }
    });

    it('denies ARCHITECT, DEVELOPER, QA_ENGINEER, SECURITY_ENGINEER, AUDITOR, VIEWER', () => {
      const deniedRoles: MembershipRole[] = [
        'ARCHITECT',
        'DEVELOPER',
        'QA_ENGINEER',
        'SECURITY_ENGINEER',
        'AUDITOR',
        'VIEWER',
      ];
      for (const role of deniedRoles) {
        expect(hasPermission(role, Permission.RELEASE_POLICY_ACTIVATE)).toBe(false);
      }
    });
  });

  describe('Permission.RELEASE_POLICY_ARCHIVE', () => {
    it('allows OWNER, ADMIN', () => {
      const allowedRoles: MembershipRole[] = ['OWNER', 'ADMIN'];
      for (const role of allowedRoles) {
        expect(hasPermission(role, Permission.RELEASE_POLICY_ARCHIVE)).toBe(true);
      }
    });

    it('denies ARCHITECT, DEVELOPER, RELEASE_MANAGER, QA_ENGINEER, SECURITY_ENGINEER, AUDITOR, VIEWER', () => {
      const deniedRoles: MembershipRole[] = [
        'ARCHITECT',
        'DEVELOPER',
        'RELEASE_MANAGER',
        'QA_ENGINEER',
        'SECURITY_ENGINEER',
        'AUDITOR',
        'VIEWER',
      ];
      for (const role of deniedRoles) {
        expect(hasPermission(role, Permission.RELEASE_POLICY_ARCHIVE)).toBe(false);
      }
    });
  });
});
