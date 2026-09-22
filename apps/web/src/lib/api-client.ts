import { HealthResponse, ReadinessResponse } from '@impactra/shared';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' ? 'http://localhost:3001' : 'http://impactra-api:3001');

export async function fetchApiHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
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
    const res = await fetch(`${API_BASE_URL}/ready`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    return (await res.json()) as ReadinessResponse;
  } catch {
    return null;
  }
}
