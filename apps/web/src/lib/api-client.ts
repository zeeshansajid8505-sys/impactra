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
} from '@impactra/shared';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    if (
      process.env.NEXT_PUBLIC_API_URL &&
      !process.env.NEXT_PUBLIC_API_URL.includes('localhost:3001') &&
      !process.env.NEXT_PUBLIC_API_URL.includes('impactra.local:3001')
    ) {
      return process.env.NEXT_PUBLIC_API_URL;
    }
    return `${window.location.protocol}//${window.location.hostname}:3001`;
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
