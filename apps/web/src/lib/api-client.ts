import {
  HealthResponse,
  ReadinessResponse,
  AuthResponse,
  RegisterRequest,
  LoginRequest,
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
  InviteMemberRequest,
  UpdateMemberRoleRequest,
  ChangePasswordRequest,
  MembershipDto,
  OrganizationDto,
  SessionDto,
  UserOrganizationSummary,
  CreateOrganizationResponse,
  InviteMemberResponse,
  GitHubConfigStatus,
  GitHubInstallationStartResponse,
  GitHubInstallationDto,
  RepositoryConnectionDto,
  RepositoryListResponse,
  RepositorySyncResponse,
  TriggerIngestionRequest,
  RepositoryIngestionDto,
  RepositoryIngestionListResponse,
  RepositorySnapshotDto,
  DigitalTwinSummaryResponse,
  DigitalTwinNodesResponse,
  DigitalTwinEdgesResponse,
  ChangeSetDto,
  ChangeRevisionDto,
  ChangedFileDto,
  TwinChangeMappingDto,
  DependencyDeltaDto,
  ChangeSetListResponse,
  ChangeRevisionListResponse,
  ChangedFilesResponse,
  TwinChangeMappingsResponse,
  DependencyDeltaResponse,
  BlastRadiusAnalysisDto,
  BlastRadiusFindingDto,
  BlastRadiusEvidencePathDto,
  BlastRadiusRootDto,
  BlastRadiusAnalysisSummaryResponse,
  BlastRadiusFindingsResponse,
  BlastRadiusEvidencePathsResponse,
  BlastRadiusAnalysesListResponse,
  ReleaseSafetyAssessmentDto,
  ReleaseSafetySignalDto,
  ReleaseSafetyLatestResponseDto,
  ReleaseSafetySignalsResponseDto,
  ReleaseSafetyAssessmentsListResponseDto,
  TriggerReleaseSafetyEvaluationDto,
  ReleaseSafetyDecision,
  ReleaseRiskLevel,
  ReleaseSafetySignalCategory,
  ReleaseSafetySignalSeverity,
  ReleaseSafetyAssessmentStatus,
  GitHubCheckPublicationDto,
  GitHubCheckLatestResponseDto,
  GitHubCheckPublishResponseDto,
  PublishGitHubCheckRequestDto,
  ReleaseApprovalStatus,
  ReleaseApprovalResolution,
  ReleaseApprovalEventType,
  EffectiveReleaseAuthorization,
  ReleaseApprovalEventDto,
  ReleaseApprovalDto,
  ReleaseApprovalWorkflowResponseDto,
  RequestReleaseApprovalRequestDto,
  ResolveReleaseApprovalRequestDto,
  GrantReleaseExceptionRequestDto,
  ReleasePolicyStatus,
  ReleasePolicyRuleType,
  ReleasePolicyAction,
  ReleasePolicyScope,
  ReleasePolicyEventType,
  ReleasePolicyRuleDto,
  ReleasePolicyDto,
  ReleasePolicyEventDto,
  ReleasePolicyRuleEvaluationDto,
  ReleasePolicySnapshotDto,
  ReleasePolicyPreviewDto,
  EffectiveReleasePolicyDto,
  CreateReleasePolicyRequest,
  UpdateReleasePolicyRequest,
  PreviewReleasePolicyRequest,
  ReleasePolicyListResponse,
} from '@impactra/shared';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    if (process.env.NEXT_PUBLIC_API_URL) {
      return process.env.NEXT_PUBLIC_API_URL;
    }
    const hostname = window.location.hostname;
    // Local development mode: explicit port 3001
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === 'impactra.local') {
      return `${window.location.protocol}//${hostname}:3001`;
    }
    // Production mode behind reverse proxy: path-based routing (/api) or origin
    return `${window.location.origin}/api`;
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://impactra-api:3001';
}

export const API_BASE_URL = getApiBaseUrl();

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `API request failed with status ${res.status}`;
    try {
      const body: unknown = await res.json();
      if (body && typeof body === 'object' && 'message' in body) {
        const msg = (body as { message?: unknown }).message;
        if (typeof msg === 'string') {
          errorMsg = msg;
        } else if (Array.isArray(msg) && msg.length > 0 && typeof msg[0] === 'string') {
          errorMsg = msg[0];
        }
      }
    } catch {
      // Body not JSON
    }
    throw new Error(errorMsg);
  }
  return res.json() as Promise<T>;
}

export async function fetchApiHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

export async function fetchApiReadiness(): Promise<ReadinessResponse | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/ready`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as ReadinessResponse;
  } catch {
    return null;
  }
}

// ==========================================
// Authentication & Sessions API
// ==========================================

export async function apiRegister(data: RegisterRequest): Promise<AuthResponse> {
  const res = await fetch(`${getApiBaseUrl()}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  return handleResponse<AuthResponse>(res);
}

export async function apiLogin(data: LoginRequest): Promise<AuthResponse> {
  const res = await fetch(`${getApiBaseUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  return handleResponse<AuthResponse>(res);
}

export async function apiLogout(): Promise<void> {
  await fetch(`${getApiBaseUrl()}/auth/logout`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
}

export async function apiLogoutAll(): Promise<void> {
  await fetch(`${getApiBaseUrl()}/auth/logout-all`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
}

export async function apiGetMe(): Promise<AuthResponse | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/auth/me`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });
    if (res.status === 401) return null;
    return handleResponse<AuthResponse>(res);
  } catch {
    return null;
  }
}

export async function apiChangePassword(data: ChangePasswordRequest): Promise<{ message: string }> {
  const res = await fetch(`${getApiBaseUrl()}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  return handleResponse<{ message: string }>(res);
}

export async function apiGetSessions(): Promise<SessionDto[]> {
  const res = await fetch(`${getApiBaseUrl()}/auth/sessions`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  return handleResponse<SessionDto[]>(res);
}

export async function apiRevokeSession(sessionId: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/auth/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  await handleResponse<{ message: string }>(res);
}

// ==========================================
// Organizations & Tenancy API
// ==========================================

export async function apiCreateOrganization(
  data: CreateOrganizationRequest,
): Promise<CreateOrganizationResponse> {
  const res = await fetch(`${getApiBaseUrl()}/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  return handleResponse<CreateOrganizationResponse>(res);
}

export async function apiListOrganizations(): Promise<UserOrganizationSummary[]> {
  const res = await fetch(`${getApiBaseUrl()}/organizations`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  return handleResponse<UserOrganizationSummary[]>(res);
}

export async function apiGetOrganization(organizationId: string): Promise<OrganizationDto> {
  const res = await fetch(`${getApiBaseUrl()}/organizations/${organizationId}`, {
    method: 'GET',
    headers: { Accept: 'application/json', 'x-organization-id': organizationId },
    credentials: 'include',
  });
  return handleResponse<OrganizationDto>(res);
}

export async function apiUpdateOrganization(
  organizationId: string,
  data: UpdateOrganizationRequest,
): Promise<OrganizationDto> {
  const res = await fetch(`${getApiBaseUrl()}/organizations/${organizationId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-organization-id': organizationId,
    },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  return handleResponse<OrganizationDto>(res);
}

// ==========================================
// Memberships & RBAC API
// ==========================================

export async function apiListMembers(organizationId: string): Promise<MembershipDto[]> {
  const res = await fetch(`${getApiBaseUrl()}/organizations/${organizationId}/members`, {
    method: 'GET',
    headers: { Accept: 'application/json', 'x-organization-id': organizationId },
    credentials: 'include',
  });
  return handleResponse<MembershipDto[]>(res);
}

export async function apiInviteMember(
  organizationId: string,
  data: InviteMemberRequest,
): Promise<InviteMemberResponse> {
  const res = await fetch(`${getApiBaseUrl()}/organizations/${organizationId}/members`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-organization-id': organizationId,
    },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  return handleResponse<InviteMemberResponse>(res);
}

export async function apiUpdateMemberRole(
  organizationId: string,
  membershipId: string,
  data: UpdateMemberRoleRequest,
): Promise<MembershipDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/members/${membershipId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      body: JSON.stringify(data),
      credentials: 'include',
    },
  );
  return handleResponse<MembershipDto>(res);
}

export async function apiRemoveMember(
  organizationId: string,
  membershipId: string,
): Promise<void> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/members/${membershipId}`,
    {
      method: 'DELETE',
      headers: { Accept: 'application/json', 'x-organization-id': organizationId },
      credentials: 'include',
    },
  );
  await handleResponse<{ message: string }>(res);
}

// ==========================================
// Phase 04: GitHub Integration & Repositories API
// ==========================================

export async function apiGetGitHubConfigStatus(): Promise<GitHubConfigStatus> {
  const res = await fetch(`${getApiBaseUrl()}/github/config/status`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  return handleResponse<GitHubConfigStatus>(res);
}

export async function apiStartGitHubInstallation(
  organizationId: string,
): Promise<GitHubInstallationStartResponse> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/github/installations/start`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<GitHubInstallationStartResponse>(res);
}

export async function apiGetGitHubInstallation(
  organizationId: string,
): Promise<GitHubInstallationDto | null> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/github/installation`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<GitHubInstallationDto | null>(res);
}

export async function apiDisconnectGitHubInstallation(
  organizationId: string,
): Promise<void> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/github/installation`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  await handleResponse<{ disconnected: boolean }>(res);
}

export async function apiSyncRepositories(
  organizationId: string,
): Promise<RepositorySyncResponse> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/github/sync`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<RepositorySyncResponse>(res);
}

export async function apiListRepositories(
  organizationId: string,
  params?: {
    search?: string;
    connected?: boolean;
    available?: boolean;
    page?: number;
    limit?: number;
  },
): Promise<RepositoryListResponse> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.connected !== undefined) query.set('connected', String(params.connected));
  if (params?.available !== undefined) query.set('available', String(params.available));
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  const url = `${getApiBaseUrl()}/organizations/${organizationId}/repositories${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-organization-id': organizationId,
    },
    credentials: 'include',
  });
  return handleResponse<RepositoryListResponse>(res);
}

export async function apiConnectRepository(
  organizationId: string,
  repositoryId: string,
): Promise<RepositoryConnectionDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/repositories/${repositoryId}/connect`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<RepositoryConnectionDto>(res);
}

export async function apiDisconnectRepository(
  organizationId: string,
  repositoryId: string,
): Promise<RepositoryConnectionDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/repositories/${repositoryId}/disconnect`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<RepositoryConnectionDto>(res);
}

// ==========================================
// Phase 05: Repository Ingestion & Digital Twin API
// ==========================================

export async function apiTriggerIngestion(
  organizationId: string,
  repositoryId: string,
  data?: TriggerIngestionRequest,
): Promise<RepositoryIngestionDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/repositories/${repositoryId}/ingestions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      body: JSON.stringify(data || {}),
      credentials: 'include',
    },
  );
  return handleResponse<RepositoryIngestionDto>(res);
}

export async function apiListIngestions(
  organizationId: string,
  repositoryId: string,
  query?: { status?: string; page?: number; limit?: number },
): Promise<RepositoryIngestionListResponse> {
  const params = new URLSearchParams();
  if (query?.status) params.set('status', query.status);
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/repositories/${repositoryId}/ingestions${qs}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<RepositoryIngestionListResponse>(res);
}

export async function apiGetIngestion(
  organizationId: string,
  repositoryId: string,
  ingestionId: string,
): Promise<RepositoryIngestionDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/repositories/${repositoryId}/ingestions/${ingestionId}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<RepositoryIngestionDto>(res);
}

export async function apiGetLatestSnapshot(
  organizationId: string,
  repositoryId: string,
): Promise<RepositorySnapshotDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/repositories/${repositoryId}/snapshots/latest`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<RepositorySnapshotDto>(res);
}

export async function apiGetLatestDigitalTwin(
  organizationId: string,
  repositoryId: string,
): Promise<DigitalTwinSummaryResponse> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/repositories/${repositoryId}/digital-twin/latest`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<DigitalTwinSummaryResponse>(res);
}

export async function apiListTwinNodes(
  organizationId: string,
  repositoryId: string,
  query?: { type?: string; search?: string; page?: number; limit?: number },
): Promise<DigitalTwinNodesResponse> {
  const params = new URLSearchParams();
  if (query?.type) params.set('type', query.type);
  if (query?.search) params.set('search', query.search);
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/repositories/${repositoryId}/digital-twin/latest/nodes${qs}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<DigitalTwinNodesResponse>(res);
}

export async function apiListTwinEdges(
  organizationId: string,
  repositoryId: string,
  query?: { type?: string; sourceNodeId?: string; targetNodeId?: string; page?: number; limit?: number },
): Promise<DigitalTwinEdgesResponse> {
  const params = new URLSearchParams();
  if (query?.type) params.set('type', query.type);
  if (query?.sourceNodeId) params.set('sourceNodeId', query.sourceNodeId);
  if (query?.targetNodeId) params.set('targetNodeId', query.targetNodeId);
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/repositories/${repositoryId}/digital-twin/latest/edges${qs}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<DigitalTwinEdgesResponse>(res);
}

// ==========================================
// Pull Request & Change Intelligence API
// ==========================================

export async function apiListChangeSets(
  organizationId: string,
  query?: {
    page?: number;
    limit?: number;
    repositoryId?: string;
    status?: string;
    search?: string;
  },
): Promise<ChangeSetListResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.repositoryId) params.set('repositoryId', query.repositoryId);
  if (query?.status) params.set('status', query.status);
  if (query?.search) params.set('search', query.search);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes${qs}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<ChangeSetListResponse>(res);
}

export async function apiGetChangeSet(
  organizationId: string,
  changeSetId: string,
): Promise<ChangeSetDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<ChangeSetDto>(res);
}

export async function apiListChangeRevisions(
  organizationId: string,
  changeSetId: string,
  query?: { page?: number; limit?: number },
): Promise<ChangeRevisionListResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/revisions${qs}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<ChangeRevisionListResponse>(res);
}

export async function apiGetChangeRevision(
  organizationId: string,
  changeSetId: string,
  revisionId: string,
): Promise<ChangeRevisionDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/revisions/${revisionId}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<ChangeRevisionDto>(res);
}

export async function apiListChangedFiles(
  organizationId: string,
  changeSetId: string,
  revisionId: string,
  query?: { page?: number; limit?: number; status?: string },
): Promise<ChangedFilesResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.status) params.set('status', query.status);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/revisions/${revisionId}/files${qs}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<ChangedFilesResponse>(res);
}

export async function apiListTwinChangeMappings(
  organizationId: string,
  changeSetId: string,
  revisionId: string,
  query?: { page?: number; limit?: number; mappingType?: string },
): Promise<TwinChangeMappingsResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.mappingType) params.set('mappingType', query.mappingType);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/revisions/${revisionId}/twin-mappings${qs}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<TwinChangeMappingsResponse>(res);
}

export async function apiListDependencyDeltas(
  organizationId: string,
  changeSetId: string,
  revisionId: string,
  query?: { page?: number; limit?: number; deltaType?: string },
): Promise<DependencyDeltaResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.deltaType) params.set('deltaType', query.deltaType);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/revisions/${revisionId}/dependency-deltas${qs}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<DependencyDeltaResponse>(res);
}

export async function apiSyncPullRequest(
  organizationId: string,
  repositoryId: string,
  prNumber: number,
): Promise<ChangeSetDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/repositories/${repositoryId}/changes/sync`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
      body: JSON.stringify({ prNumber }),
    },
  );
  return handleResponse<ChangeSetDto>(res);
}

export async function apiTriggerBlastRadiusAnalysis(
  organizationId: string,
  changeSetId: string,
  body?: { force?: boolean },
): Promise<BlastRadiusAnalysisDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/blast-radius/analyze`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
      body: JSON.stringify(body || {}),
    },
  );
  return handleResponse<BlastRadiusAnalysisDto>(res);
}

export async function apiGetLatestBlastRadius(
  organizationId: string,
  changeSetId: string,
): Promise<BlastRadiusAnalysisSummaryResponse> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/blast-radius/latest`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<BlastRadiusAnalysisSummaryResponse>(res);
}

export async function apiGetBlastRadiusAnalysis(
  organizationId: string,
  changeSetId: string,
  analysisId: string,
): Promise<BlastRadiusAnalysisDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/blast-radius/${analysisId}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<BlastRadiusAnalysisDto>(res);
}

export async function apiListBlastRadiusFindings(
  organizationId: string,
  changeSetId: string,
  analysisId: string,
  query?: {
    page?: number;
    limit?: number;
    category?: string;
    impactClass?: string;
    depth?: number;
    snapshotSide?: string;
    search?: string;
  },
): Promise<BlastRadiusFindingsResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.category) params.set('category', query.category);
  if (query?.impactClass) params.set('impactClass', query.impactClass);
  if (query?.depth) params.set('depth', String(query.depth));
  if (query?.snapshotSide) params.set('snapshotSide', query.snapshotSide);
  if (query?.search) params.set('search', query.search);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/blast-radius/${analysisId}/findings${qs}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<BlastRadiusFindingsResponse>(res);
}

export async function apiListBlastRadiusEvidencePaths(
  organizationId: string,
  changeSetId: string,
  analysisId: string,
  query?: {
    page?: number;
    limit?: number;
    findingId?: string;
    rootStableKey?: string;
    affectedStableKey?: string;
  },
): Promise<BlastRadiusEvidencePathsResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.findingId) params.set('findingId', query.findingId);
  if (query?.rootStableKey) params.set('rootStableKey', query.rootStableKey);
  if (query?.affectedStableKey) params.set('affectedStableKey', query.affectedStableKey);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/blast-radius/${analysisId}/evidence-paths${qs}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<BlastRadiusEvidencePathsResponse>(res);
}

export async function apiListOrganizationBlastRadiusAnalyses(
  organizationId: string,
  query?: {
    page?: number;
    limit?: number;
    repositoryId?: string;
    status?: string;
  },
): Promise<BlastRadiusAnalysesListResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.repositoryId) params.set('repositoryId', query.repositoryId);
  if (query?.status) params.set('status', query.status);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/blast-radius${qs}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<BlastRadiusAnalysesListResponse>(res);
}

export async function apiTriggerReleaseSafetyEvaluation(
  organizationId: string,
  changeSetId: string,
  body?: TriggerReleaseSafetyEvaluationDto,
): Promise<ReleaseSafetyAssessmentDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/release-safety/evaluate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
      body: JSON.stringify(body || {}),
    },
  );
  return handleResponse<ReleaseSafetyAssessmentDto>(res);
}

export async function apiGetLatestReleaseSafetyAssessment(
  organizationId: string,
  changeSetId: string,
): Promise<ReleaseSafetyLatestResponseDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/release-safety/latest`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<ReleaseSafetyLatestResponseDto>(res);
}

export async function apiGetReleaseSafetyAssessment(
  organizationId: string,
  assessmentId: string,
): Promise<ReleaseSafetyAssessmentDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/release-safety/assessments/${assessmentId}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<ReleaseSafetyAssessmentDto>(res);
}

export async function apiListReleaseSafetySignals(
  organizationId: string,
  assessmentId: string,
  query?: {
    page?: number;
    limit?: number;
    category?: string;
    severity?: string;
    blocking?: boolean;
    requiresReview?: boolean;
  },
): Promise<ReleaseSafetySignalsResponseDto> {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.category) params.set('category', query.category);
  if (query?.severity) params.set('severity', query.severity);
  if (query?.blocking !== undefined) params.set('blocking', String(query.blocking));
  if (query?.requiresReview !== undefined) params.set('requiresReview', String(query.requiresReview));

  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/release-safety/assessments/${assessmentId}/signals${qs}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<ReleaseSafetySignalsResponseDto>(res);
}

export async function apiListOrganizationReleaseSafetyAssessments(
  organizationId: string,
  query?: {
    page?: number;
    limit?: number;
    decision?: string;
    riskLevel?: string;
    status?: string;
  },
): Promise<ReleaseSafetyAssessmentsListResponseDto> {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.decision) params.set('decision', query.decision);
  if (query?.riskLevel) params.set('riskLevel', query.riskLevel);
  if (query?.status) params.set('status', query.status);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/release-safety/assessments${qs}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<ReleaseSafetyAssessmentsListResponseDto>(res);
}

// ==========================================
// GitHub Checks & Release Gate API
// ==========================================

export async function apiGetLatestGitHubCheck(
  organizationId: string,
  changeSetId: string,
): Promise<GitHubCheckLatestResponseDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/github-check/latest`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<GitHubCheckLatestResponseDto>(res);
}

export async function apiGetGitHubCheckById(
  organizationId: string,
  changeSetId: string,
  publicationId: string,
): Promise<GitHubCheckPublicationDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/github-check/${publicationId}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<GitHubCheckPublicationDto>(res);
}

export async function apiPublishGitHubCheck(
  organizationId: string,
  changeSetId: string,
  assessmentId?: string,
): Promise<GitHubCheckPublishResponseDto> {
  const body: PublishGitHubCheckRequestDto = {};
  if (assessmentId) {
    body.assessmentId = assessmentId;
  }

  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/github-check/publish`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
      body: JSON.stringify(body),
    },
  );
  return handleResponse<GitHubCheckPublishResponseDto>(res);
}

// ==========================================
// Phase 10: Release Approval & Exception Workflow
// ==========================================

export async function apiGetReleaseApprovalWorkflow(
  organizationId: string,
  changeSetId: string,
  assessmentId?: string,
): Promise<ReleaseApprovalWorkflowResponseDto> {
  const query = assessmentId ? `?assessmentId=${encodeURIComponent(assessmentId)}` : '';
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/release-approval${query}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<ReleaseApprovalWorkflowResponseDto>(res);
}
export async function apiPostRequestReleaseApproval(
  organizationId: string,
  changeSetId: string,
  body: RequestReleaseApprovalRequestDto,
): Promise<ReleaseApprovalWorkflowResponseDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/release-approval/request`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
      body: JSON.stringify(body),
    },
  );
  return handleResponse<ReleaseApprovalWorkflowResponseDto>(res);
}
export async function apiPostApproveRelease(
  organizationId: string,
  changeSetId: string,
  approvalId: string,
  body: ResolveReleaseApprovalRequestDto,
): Promise<ReleaseApprovalWorkflowResponseDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/release-approval/${approvalId}/approve`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
      body: JSON.stringify(body),
    },
  );
  return handleResponse<ReleaseApprovalWorkflowResponseDto>(res);
}
export async function apiPostRejectRelease(
  organizationId: string,
  changeSetId: string,
  approvalId: string,
  body: ResolveReleaseApprovalRequestDto,
): Promise<ReleaseApprovalWorkflowResponseDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/release-approval/${approvalId}/reject`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
      body: JSON.stringify(body),
    },
  );
  return handleResponse<ReleaseApprovalWorkflowResponseDto>(res);
}
export async function apiPostGrantReleaseException(
  organizationId: string,
  changeSetId: string,
  approvalId: string,
  body: GrantReleaseExceptionRequestDto,
): Promise<ReleaseApprovalWorkflowResponseDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/changes/${changeSetId}/release-approval/${approvalId}/exception`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
      body: JSON.stringify(body),
    },
  );
  return handleResponse<ReleaseApprovalWorkflowResponseDto>(res);
}
export async function apiListReleasePolicies(
  organizationId: string,
  params?: {
    repositoryConnectionId?: string;
    status?: ReleasePolicyStatus;
    isDefault?: boolean;
  },
): Promise<ReleasePolicyDto[]> {
  const query = new URLSearchParams();
  if (params?.repositoryConnectionId) query.set('repositoryConnectionId', params.repositoryConnectionId);
  if (params?.status) query.set('status', params.status);
  if (params?.isDefault !== undefined) query.set('isDefault', String(params.isDefault));
  const qs = query.toString() ? `?${query.toString()}` : '';

  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/release-policies${qs}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<ReleasePolicyDto[]>(res);
}

export async function apiGetReleasePolicy(
  organizationId: string,
  policyId: string,
): Promise<ReleasePolicyDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/release-policies/${policyId}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<ReleasePolicyDto>(res);
}

export async function apiCreateReleasePolicy(
  organizationId: string,
  body: CreateReleasePolicyRequest,
): Promise<ReleasePolicyDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/release-policies`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
      body: JSON.stringify(body),
    },
  );
  return handleResponse<ReleasePolicyDto>(res);
}

export async function apiUpdateReleasePolicy(
  organizationId: string,
  policyId: string,
  body: UpdateReleasePolicyRequest,
): Promise<ReleasePolicyDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/release-policies/${policyId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
      body: JSON.stringify(body),
    },
  );
  return handleResponse<ReleasePolicyDto>(res);
}

export async function apiActivateReleasePolicy(
  organizationId: string,
  policyId: string,
): Promise<ReleasePolicyDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/release-policies/${policyId}/activate`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<ReleasePolicyDto>(res);
}

export async function apiArchiveReleasePolicy(
  organizationId: string,
  policyId: string,
): Promise<ReleasePolicyDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/release-policies/${policyId}/archive`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<ReleasePolicyDto>(res);
}

export async function apiPreviewReleasePolicy(
  organizationId: string,
  body: PreviewReleasePolicyRequest,
): Promise<ReleasePolicyPreviewDto> {
  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/release-policies/preview`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
      body: JSON.stringify(body),
    },
  );
  return handleResponse<ReleasePolicyPreviewDto>(res);
}

export async function apiGetEffectiveReleasePolicy(
  organizationId: string,
  repositoryConnectionId?: string,
  targetBranch?: string,
): Promise<EffectiveReleasePolicyDto> {
  const query = new URLSearchParams();
  if (repositoryConnectionId) query.set('repositoryConnectionId', repositoryConnectionId);
  if (targetBranch) query.set('targetBranch', targetBranch);
  const qs = query.toString() ? `?${query.toString()}` : '';

  const res = await fetch(
    `${getApiBaseUrl()}/organizations/${organizationId}/release-policies/effective${qs}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-organization-id': organizationId,
      },
      credentials: 'include',
    },
  );
  return handleResponse<EffectiveReleasePolicyDto>(res);
}
