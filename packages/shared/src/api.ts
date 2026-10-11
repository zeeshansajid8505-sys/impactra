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
  | 'session.manage.all'
  | 'github_installation.read'
  | 'github_installation.manage'
  | 'repository.read'
  | 'repository.manage'
  | 'ingestion.trigger'
  | 'ingestion.read'
  | 'digital_twin.read';

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

// ==========================================
// Phase 04: GitHub App & Repositories Contracts
// ==========================================

export type GitHubInstallationStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED' | 'DISCONNECTED';

export interface GitHubConfigStatus {
  configured: boolean;
  appSlug?: string;
  installationsEnabled: boolean;
  appIdConfigured?: boolean;
  slugConfigured?: boolean;
  privateKeyConfigured?: boolean;
  webhookSecretConfigured?: boolean;
  installUrl?: string | null;
}

export interface GitHubInstallationStartResponse {
  installUrl: string;
}

export interface GitHubInstallationDto {
  id: string;
  organizationId: string;
  githubInstallationId: string;
  accountId: string;
  accountLogin: string;
  accountType: string;
  repositorySelection: string;
  status: GitHubInstallationStatus;
  installedAt: string;
  suspendedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryConnectionDto {
  id: string;
  organizationId: string;
  githubInstallationId: string;
  githubRepositoryId: string;
  nodeId: string | null;
  ownerLogin: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  visibility: string;
  archived: boolean;
  disabled: boolean;
  fork: boolean;
  htmlUrl: string;
  available: boolean;
  connected: boolean;
  connectedAt: string | null;
  disconnectedAt: string | null;
  githubUpdatedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryListResponse {
  repositories: RepositoryConnectionDto[];
  total: number;
}

export interface RepositorySyncResponse {
  syncedCount: number;
  availableCount: number;
  removedCount: number;
}

export interface WebhookProcessingResponse {
  received: boolean;
  duplicate?: boolean;
  handled?: boolean;
  deliveryId?: string;
}

// ==========================================
// Phase 05: Repository Ingestion & Digital Twin Foundation
// ==========================================

export type RepositoryIngestionStatus =
  | 'QUEUED'
  | 'FETCHING'
  | 'VALIDATING'
  | 'INDEXING'
  | 'BUILDING_TWIN'
  | 'STORING'
  | 'SUCCEEDED'
  | 'FAILED';

export type RepositoryFileCategory =
  | 'SOURCE_CODE'
  | 'CONFIGURATION'
  | 'DOCUMENTATION'
  | 'TEST'
  | 'BUILD_SYSTEM'
  | 'DATA'
  | 'BINARY'
  | 'OTHER';

export type DigitalTwinNodeTypeEnum =
  | 'REPOSITORY'
  | 'FILE'
  | 'WORKSPACE_PACKAGE'
  | 'EXTERNAL_DEPENDENCY'
  | 'CONFIG';

export type DigitalTwinEdgeType =
  | 'CONTAINS'
  | 'IMPORTS'
  | 'DECLARES_DEPENDENCY'
  | 'WORKSPACE_DEPENDS_ON';

export interface TriggerIngestionRequest {
  ref?: string;
  commitSha?: string;
}

export interface RepositoryIngestionDto {
  id: string;
  organizationId: string;
  repositoryConnectionId: string;
  requestedByUserId: string | null;
  targetRef: string;
  commitSha: string | null;
  status: RepositoryIngestionStatus;
  stage: string;
  startedAt: string | null;
  completedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryIngestionListResponse {
  ingestions: RepositoryIngestionDto[];
  total: number;
}

export interface RepositoryFileInventoryDto {
  id: string;
  repositorySnapshotId: string;
  path: string;
  contentSha256: string;
  byteSize: number;
  language: string | null;
  isBinary: boolean;
  category: RepositoryFileCategory;
  createdAt: string;
}

export interface RepositorySnapshotDto {
  id: string;
  organizationId: string;
  repositoryConnectionId: string;
  ingestionId: string;
  commitSha: string;
  ref: string;
  sourceProvider: string;
  parserVersion: string;
  artifactKey: string | null;
  artifactSha256: string | null;
  sourceBytes: number;
  fileCount: number;
  createdAt: string;
  fileInventories?: RepositoryFileInventoryDto[];
}

export interface DigitalTwinNodeEntityDto {
  id: string;
  digitalTwinSnapshotId: string;
  stableKey: string;
  type: DigitalTwinNodeTypeEnum;
  name: string;
  path: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DigitalTwinEdgeDto {
  id: string;
  digitalTwinSnapshotId: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: DigitalTwinEdgeType;
  evidence: Record<string, unknown>;
  createdAt: string;
  sourceNode?: DigitalTwinNodeEntityDto;
  targetNode?: DigitalTwinNodeEntityDto;
}

export interface DigitalTwinSnapshotDto {
  id: string;
  organizationId: string;
  repositoryConnectionId: string;
  repositorySnapshotId: string;
  twinVersion: string;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
}

export interface DigitalTwinSummaryResponse {
  snapshot: DigitalTwinSnapshotDto;
  repositorySnapshot: RepositorySnapshotDto;
  nodeCount: number;
  edgeCount: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  languageDistribution: Record<string, number>;
}

export interface DigitalTwinNodesResponse {
  nodes: DigitalTwinNodeEntityDto[];
  total: number;
  page: number;
  limit: number;
}

export interface DigitalTwinEdgesResponse {
  edges: DigitalTwinEdgeDto[];
  total: number;
  page: number;
  limit: number;
}
