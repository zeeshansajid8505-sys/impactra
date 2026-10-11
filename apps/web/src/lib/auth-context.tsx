'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  UserDto,
  SessionDto,
  UserOrganizationSummary,
  LoginRequest,
  RegisterRequest,
} from '@impactra/shared';
import {
  apiGetMe,
  apiLogin,
  apiRegister,
  apiLogout,
} from './api-client';

interface AuthContextType {
  user: UserDto | null;
  session: SessionDto | null;
  organizations: UserOrganizationSummary[];
  activeOrg: UserOrganizationSummary | null;
  isLoading: boolean;
  setActiveOrgId: (orgId: string) => void;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACTIVE_ORG_STORAGE_KEY = 'impactra_active_org_id';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [session, setSession] = useState<SessionDto | null>(null);
  const [organizations, setOrganizations] = useState<UserOrganizationSummary[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Reusable auth fetcher for user actions (login, register, manual refresh)
  const fetchAuth = useCallback(async () => {
    try {
      const data = await apiGetMe();
      if (data) {
        setUser(data.user);
        setSession(data.session);
        setOrganizations(data.organizations);

        const storedOrgId =
          typeof window !== 'undefined'
            ? localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)
            : null;
        const validStored = data.organizations.find(
          (o) => o.organization.id === storedOrgId,
        );

        if (validStored) {
          setActiveOrgIdState(validStored.organization.id);
        } else if (data.organizations.length > 0) {
          setActiveOrgIdState(data.organizations[0].organization.id);
          if (typeof window !== 'undefined') {
            localStorage.setItem(
              ACTIVE_ORG_STORAGE_KEY,
              data.organizations[0].organization.id,
            );
          }
        } else {
          setActiveOrgIdState(null);
        }
      } else {
        setUser(null);
        setSession(null);
        setOrganizations([]);
        setActiveOrgIdState(null);
      }
    } catch {
      setUser(null);
      setSession(null);
      setOrganizations([]);
      setActiveOrgIdState(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial startup bootstrap using canonical async subscription pattern
  useEffect(() => {
    let ignore = false;

    apiGetMe()
      .then((data) => {
        if (ignore) return;
        if (data) {
          setUser(data.user);
          setSession(data.session);
          setOrganizations(data.organizations);

          const storedOrgId =
            typeof window !== 'undefined'
              ? localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)
              : null;
          const validStored = data.organizations.find(
            (o) => o.organization.id === storedOrgId,
          );

          if (validStored) {
            setActiveOrgIdState(validStored.organization.id);
          } else if (data.organizations.length > 0) {
            setActiveOrgIdState(data.organizations[0].organization.id);
            if (typeof window !== 'undefined') {
              localStorage.setItem(
                ACTIVE_ORG_STORAGE_KEY,
                data.organizations[0].organization.id,
              );
            }
          } else {
            setActiveOrgIdState(null);
          }
        } else {
          setUser(null);
          setSession(null);
          setOrganizations([]);
          setActiveOrgIdState(null);
        }
      })
      .catch(() => {
        if (!ignore) {
          setUser(null);
          setSession(null);
          setOrganizations([]);
          setActiveOrgIdState(null);
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const setActiveOrgId = (orgId: string) => {
    setActiveOrgIdState(orgId);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId);
    }
  };

  const login = async (data: LoginRequest) => {
    await apiLogin(data);
    await fetchAuth();
  };

  const register = async (data: RegisterRequest) => {
    await apiRegister(data);
    await fetchAuth();
  };

  const logout = async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
      setSession(null);
      setOrganizations([]);
      setActiveOrgIdState(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
      }
    }
  };

  const activeOrg = organizations.find((o) => o.organization.id === activeOrgId) || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        organizations,
        activeOrg,
        isLoading,
        setActiveOrgId,
        login,
        register,
        logout,
        refresh: fetchAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
