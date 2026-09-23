import { MembershipRole } from '@impactra/shared';
import { Permission } from './permissions.enum';

/**
 * Centralized Role-Based Access Control (RBAC) permission policy.
 * Maps every organizational role to its allowed granular capabilities.
 */
export const ROLE_PERMISSIONS: Record<MembershipRole, readonly Permission[]> = {
  OWNER: [
    Permission.ORGANIZATION_READ,
    Permission.ORGANIZATION_UPDATE,
    Permission.ORGANIZATION_DELETE,
    Permission.MEMBERSHIP_READ,
    Permission.MEMBERSHIP_INVITE,
    Permission.MEMBERSHIP_ROLE_UPDATE,
    Permission.MEMBERSHIP_REMOVE,
    Permission.SESSION_MANAGE_SELF,
    Permission.SESSION_MANAGE_ALL,
  ],
  ADMIN: [
    Permission.ORGANIZATION_READ,
    Permission.ORGANIZATION_UPDATE,
    Permission.MEMBERSHIP_READ,
    Permission.MEMBERSHIP_INVITE,
    Permission.MEMBERSHIP_ROLE_UPDATE,
    Permission.MEMBERSHIP_REMOVE,
    Permission.SESSION_MANAGE_SELF,
    Permission.SESSION_MANAGE_ALL,
  ],
  ARCHITECT: [
    Permission.ORGANIZATION_READ,
    Permission.MEMBERSHIP_READ,
    Permission.SESSION_MANAGE_SELF,
  ],
  SECURITY_ENGINEER: [
    Permission.ORGANIZATION_READ,
    Permission.MEMBERSHIP_READ,
    Permission.SESSION_MANAGE_SELF,
  ],
  DEVELOPER: [
    Permission.ORGANIZATION_READ,
    Permission.MEMBERSHIP_READ,
    Permission.SESSION_MANAGE_SELF,
  ],
  RELEASE_MANAGER: [
    Permission.ORGANIZATION_READ,
    Permission.MEMBERSHIP_READ,
    Permission.SESSION_MANAGE_SELF,
  ],
  QA_ENGINEER: [
    Permission.ORGANIZATION_READ,
    Permission.MEMBERSHIP_READ,
    Permission.SESSION_MANAGE_SELF,
  ],
  AUDITOR: [
    Permission.ORGANIZATION_READ,
    Permission.MEMBERSHIP_READ,
    Permission.SESSION_MANAGE_SELF,
  ],
  VIEWER: [
    Permission.ORGANIZATION_READ,
    Permission.MEMBERSHIP_READ,
    Permission.SESSION_MANAGE_SELF,
  ],
};

export function hasPermission(role: MembershipRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

export function hasAllPermissions(
  role: MembershipRole,
  requiredPermissions: Permission[],
): boolean {
  return requiredPermissions.every((perm) => hasPermission(role, perm));
}
