'use client';

import React, { useState } from 'react';
import {
  Building2,
  Users,
  Shield,
  Key,
  Smartphone,
  Trash2,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Copy,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  apiUpdateOrganization,
  apiListMembers,
  apiInviteMember,
  apiUpdateMemberRole,
  apiRemoveMember,
  apiGetSessions,
  apiRevokeSession,
  apiLogoutAll,
  apiChangePassword,
} from '@/lib/api-client';
import { MembershipDto, MembershipRole, SessionDto, UserOrganizationSummary } from '@impactra/shared';

const ROLES: MembershipRole[] = [
  'OWNER',
  'ADMIN',
  'ARCHITECT',
  'SECURITY_ENGINEER',
  'DEVELOPER',
  'RELEASE_MANAGER',
  'QA_ENGINEER',
  'AUDITOR',
  'VIEWER',
];

interface OrganizationProfileFormProps {
  activeOrg: UserOrganizationSummary;
  isOwnerOrAdmin: boolean;
  onRefresh: () => Promise<void>;
}

function OrganizationProfileForm({
  activeOrg,
  isOwnerOrAdmin,
  onRefresh,
}: OrganizationProfileFormProps) {
  const [orgName, setOrgName] = useState(activeOrg.organization.name);
  const [orgSlug, setOrgSlug] = useState(activeOrg.organization.slug);
  const [orgSuccess, setOrgSuccess] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);

  const handleUpdateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgLoading(true);
    setOrgSuccess(null);
    setOrgError(null);

    try {
      await apiUpdateOrganization(activeOrg.organization.id, {
        name: orgName.trim(),
        slug: orgSlug.trim(),
      });
      await onRefresh();
      setOrgSuccess('Organization profile updated successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update organization';
      setOrgError(msg);
    } finally {
      setOrgLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-lg">
      {orgSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 text-xs">
          <CheckCircle2 className="w-4 h-4" />
          <span>{orgSuccess}</span>
        </div>
      )}

      {orgError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400 text-xs">
          <AlertCircle className="w-4 h-4" />
          <span>{orgError}</span>
        </div>
      )}

      <form onSubmit={handleUpdateOrg} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
            Tenant Immutable ID
          </label>
          <input
            type="text"
            readOnly
            value={activeOrg.organization.id}
            className="w-full px-3 py-1.5 rounded-lg text-xs font-mono bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-muted)] select-all"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
            Organization Display Name
          </label>
          <input
            type="text"
            required
            disabled={!isOwnerOrAdmin}
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)] disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
            Organization Slug
          </label>
          <input
            type="text"
            required
            disabled={!isOwnerOrAdmin}
            value={orgSlug}
            onChange={(e) => setOrgSlug(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm font-mono bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)] disabled:opacity-60"
          />
        </div>

        {isOwnerOrAdmin ? (
          <button
            type="submit"
            disabled={orgLoading}
            className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-[var(--text-primary)] hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {orgLoading ? 'Saving...' : 'Save Organization Changes'}
          </button>
        ) : (
          <p className="text-xs text-[var(--text-muted)] italic">
            Only Organization Owners or Admins may modify organization settings.
          </p>
        )}
      </form>
    </div>
  );
}

export default function SettingsPage() {
  const { user, activeOrg, refresh } = useAuth();
  const [activeTab, setActiveTab] = useState<'org' | 'members' | 'security'>('org');

  // Members State
  const [members, setMembers] = useState<MembershipDto[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MembershipRole>('DEVELOPER');
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  // Security State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Data fetchers called explicitly on user interactions and events
  const loadMembers = async () => {
    if (!activeOrg) return;
    setMembersLoading(true);
    try {
      const data = await apiListMembers(activeOrg.organization.id);
      setMembers(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load members';
      setInviteError(msg);
    } finally {
      setMembersLoading(false);
    }
  };

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const data = await apiGetSessions();
      setSessions(data);
    } catch {
      // Ignored
    } finally {
      setSessionsLoading(false);
    }
  };

  const handleSelectTab = (tab: 'org' | 'members' | 'security') => {
    setActiveTab(tab);
    if (tab === 'members') {
      void loadMembers();
    } else if (tab === 'security') {
      void loadSessions();
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !inviteEmail.trim()) return;
    setInviteSuccess(null);
    setInviteError(null);
    setInviteLink(null);

    try {
      const res = await apiInviteMember(activeOrg.organization.id, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });

      if (res.status === 'added') {
        setInviteSuccess(`Successfully added ${res.email} as ${res.role}.`);
      } else {
        setInviteSuccess(`Invitation dispatched to ${res.email}.`);
        if (res.invitationLink) {
          setInviteLink(`${window.location.origin}${res.invitationLink}`);
        }
      }

      setInviteEmail('');
      setInviteRole('DEVELOPER');
      await loadMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to invite member';
      setInviteError(msg);
    }
  };

  const handleRoleChange = async (membershipId: string, role: MembershipRole) => {
    if (!activeOrg) return;
    try {
      await apiUpdateMemberRole(activeOrg.organization.id, membershipId, { role });
      await loadMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update role';
      alert(msg);
    }
  };

  const handleRemoveMember = async (membershipId: string) => {
    if (!activeOrg || !confirm('Are you sure you want to remove this member from the organization?')) {
      return;
    }
    try {
      await apiRemoveMember(activeOrg.organization.id, membershipId);
      await loadMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove member';
      alert(msg);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdSuccess(null);
    setPwdError(null);

    if (newPassword !== confirmPassword) {
      setPwdError('New passwords do not match');
      return;
    }

    setPwdLoading(true);
    try {
      const res = await apiChangePassword({ currentPassword, newPassword });
      setPwdSuccess(res.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await loadSessions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change password';
      setPwdError(msg);
    } finally {
      setPwdLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await apiRevokeSession(sessionId);
      await loadSessions();
    } catch {
      // Ignored
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    try {
      await apiLogoutAll();
      window.location.reload();
    } catch {
      // Ignored
    }
  };

  const isOwnerOrAdmin =
    activeOrg?.membership.role === 'OWNER' || activeOrg?.membership.role === 'ADMIN';

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Workspace Settings & Security Governance
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Manage organizational profile, role-based access controls (RBAC), and user session security.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] gap-6 text-xs font-medium">
        <button
          type="button"
          onClick={() => handleSelectTab('org')}
          className={`pb-3 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'org'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Organization Profile</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelectTab('members')}
          className={`pb-3 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'members'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Members & Access Control</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelectTab('security')}
          className={`pb-3 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'security'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Account Security & Sessions</span>
        </button>
      </div>

      {/* Tab Content 1: Organization Profile */}
      {activeTab === 'org' && (
        <div className="bg-[var(--surface)] p-6 rounded-xl border border-[var(--border)] space-y-6">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Organization Metadata</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Unique tenant boundary details for deterministic code analysis and release gates.
            </p>
          </div>

          {activeOrg ? (
            <OrganizationProfileForm
              key={activeOrg.organization.id}
              activeOrg={activeOrg}
              isOwnerOrAdmin={isOwnerOrAdmin}
              onRefresh={refresh}
            />
          ) : (
            <div className="text-xs text-[var(--text-muted)] p-4 bg-[var(--surface-raised)] rounded-lg border border-[var(--border)]">
              No active organization selected.
            </div>
          )}
        </div>
      )}

      {/* Tab Content 2: Members & Access Control */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          {/* Add / Invite Member Header Button */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Organization Members</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Manage roles and permissions for team members within {activeOrg?.organization.name}.
              </p>
            </div>
            {isOwnerOrAdmin && (
              <button
                type="button"
                onClick={() => setShowInviteModal(!showInviteModal)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Invite Member</span>
              </button>
            )}
          </div>

          {/* Invitation Box / Modal */}
          {showInviteModal && isOwnerOrAdmin && (
            <div className="p-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] space-y-4 animate-in fade-in duration-150">
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Invite Colleague to Organization
              </div>

              {inviteSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 text-xs space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{inviteSuccess}</span>
                  </div>
                  {inviteLink && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        readOnly
                        value={inviteLink}
                        className="w-full px-2 py-1 text-xs font-mono bg-white dark:bg-zinc-900 border rounded"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(inviteLink);
                          alert('Invitation link copied to clipboard.');
                        }}
                        className="px-2 py-1 bg-indigo-600 text-white rounded text-xs flex items-center gap-1 shrink-0"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy Link</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {inviteError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{inviteError}</span>
                </div>
              )}

              <form onSubmit={handleInviteMember} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@impactra.internal"
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)]"
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as MembershipRole)}
                    className="w-full px-3 py-2 rounded-lg text-xs bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)] font-mono"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r} disabled={r === 'OWNER' && activeOrg?.membership.role !== 'OWNER'}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-[var(--text-primary)] hover:opacity-90 shrink-0 cursor-pointer"
                  >
                    Add Member
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Members Table */}
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Active Members</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Users with authorized access to {activeOrg?.organization.name}
                </p>
              </div>
              <span className="text-xs font-mono bg-[var(--surface-raised)] px-2 py-0.5 rounded border border-[var(--border)]">
                {members.length} member{members.length !== 1 ? 's' : ''}
              </span>
            </div>

            {membersLoading ? (
              <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading members...</div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {members.map((m) => (
                  <div key={m.id} className="p-4 sm:px-6 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center font-bold text-xs text-indigo-700 dark:text-indigo-400">
                        {m.user?.name?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2">
                          <span>{m.user?.name || 'User'}</span>
                          {m.userId === user?.id && (
                            <span className="text-[10px] text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.2 rounded font-mono">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-[var(--text-muted)]">
                          {m.user?.email || m.userId}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {isOwnerOrAdmin && m.userId !== user?.id ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value as MembershipRole)}
                          className="text-xs font-mono px-2 py-1 rounded bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)] cursor-pointer"
                        >
                          {ROLES.map((r) => (
                            <option
                              key={r}
                              value={r}
                              disabled={r === 'OWNER' && activeOrg?.membership.role !== 'OWNER'}
                            >
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          {m.role}
                        </span>
                      )}

                      {isOwnerOrAdmin && m.userId !== user?.id && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.id)}
                          className="p-1.5 rounded text-[var(--text-muted)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="Remove member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content 3: Account Security & Sessions */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Change Password */}
          <div className="bg-[var(--surface)] p-6 rounded-xl border border-[var(--border)] space-y-4">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Change Account Password</h2>
            </div>

            {pwdSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span>{pwdSuccess}</span>
              </div>
            )}

            {pwdError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs">
                <AlertCircle className="w-4 h-4" />
                <span>{pwdError}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3 max-w-md">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)]"
                />
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-[var(--text-primary)] hover:opacity-90 cursor-pointer"
                >
                  {pwdLoading ? 'Updating password...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>

          {/* Active Sessions */}
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Active Device Sessions</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Cryptographically hashed, durable server-side sessions attached to your account.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRevokeAllOtherSessions}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                Revoke All Other Sessions
              </button>
            </div>

            {sessionsLoading ? (
              <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading sessions...</div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {sessions.map((s) => (
                  <div key={s.id} className="p-4 sm:px-6 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] flex items-center justify-center text-[var(--text-secondary)]">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2">
                          <span>{s.userAgent || 'Web Browser'}</span>
                          {s.isCurrent && (
                            <span className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 px-1.5 py-0.2 rounded font-mono">
                              Current Session
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-[var(--text-muted)]">
                          IP: {s.ipAddress || 'unknown'} · Last active:{' '}
                          {new Date(s.lastActiveAt).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {!s.isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleRevokeSession(s.id)}
                        className="px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded border border-transparent hover:border-red-200 transition-colors"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
