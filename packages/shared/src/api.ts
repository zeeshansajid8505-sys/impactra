/**
 * @impactra/shared - API Response & Request Contracts
 */

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  uptime: number;
  service: string;
  version: string;
}

export interface DependencyStatus {
  status: 'healthy' | 'unhealthy';
  latencyMs?: number;
  error?: string;
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  timestamp: string;
  service: string;
  dependencies: {
    postgres: DependencyStatus;
    redis: DependencyStatus;
    minio: DependencyStatus;
  };
}

export interface ApiErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  timestamp: string;
  path?: string;
  details?: unknown;
}

// ==========================================
// Phase 03: Auth, Tenancy, RBAC Contracts
// ==========================================

export type MembershipRole =
  | 'OWNER'
  | 'ADMIN'
  | 'ARCHITECT'
  | 'SECURITY_ENGINEER'
  | 'DEVELOPER'
  | 'RELEASE_MANAGER'
  | 'QA_ENGINEER'
  | 'AUDITOR'
  | 'VIEWER';

export type Permission =
  | 'organization.read'
  | 'organization.update'
  | 'organization.delete'
  | 'membership.read'
  | 'membership.invite'
  | 'membership.role.update'
  | 'membership.remove'
  | 'session.manage.self'
  | 'session.manage.all';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipDto {
  id: string;
  organizationId: string;
  userId: string;
  role: MembershipRole;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface SessionDto {
  id: string;
  userId: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  isCurrent?: boolean;
}

export interface UserOrganizationSummary {
  organization: OrganizationDto;
  membership: {
    id: string;
    role: MembershipRole;
  };
}

export interface AuthResponse {
  user: UserDto;
  session: SessionDto;
  organizations: UserOrganizationSummary[];
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirmRequest {
  token: string;
  newPassword: string;
}

export interface CreateOrganizationRequest {
  name: string;
  slug?: string;
}

export interface UpdateOrganizationRequest {
  name?: string;
  slug?: string;
}

export interface InviteMemberRequest {
  email: string;
  role: MembershipRole;
}

export interface UpdateMemberRoleRequest {
  role: MembershipRole;
}

export interface InvitationDto {
  id: string;
  organizationId: string;
  email: string;
  role: MembershipRole;
  expiresAt: string;
  createdAt: string;
  invitationLink?: string;
}

export interface CreateOrganizationResponse {
  organization: OrganizationDto;
  membership: MembershipDto;
}

export interface InviteMemberResponse {
  status: 'added' | 'invited';
  email: string;
  role: MembershipRole;
  membership?: MembershipDto;
  invitationId?: string;
  invitationLink?: string;
}
