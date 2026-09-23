'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Search,
  Menu,
  X,
  Settings,
  GitFork,
  Building2,
  Check,
  Plus,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { ThemeToggle } from '../shared/ThemeToggle';
import { ExplanatoryModal, ExplanatoryModalType } from '../shared/ExplanatoryModal';
import { useAuth } from '@/lib/auth-context';

interface NavItem {
  label: string;
  href: string;
}

const PRIMARY_NAV_ITEMS: NavItem[] = [
  { label: 'Overview', href: '/' },
  { label: 'Changes', href: '/changes/pull-requests' },
  { label: 'Digital Twin', href: '/digital-twin/system-map' },
  { label: 'Intelligence', href: '/intelligence/blast-radius' },
  { label: 'Release', href: '/release/safety' },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, organizations, activeOrg, setActiveOrgId, logout } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [modalType, setModalType] = useState<ExplanatoryModalType>(null);

  const isActiveRoute = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    setProfileMenuOpen(false);
    await logout();
    router.push('/login');
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-15 flex items-center justify-between gap-4">
          {/* Left: Brand, Organization Switcher & Primary Nav */}
          <div className="flex items-center gap-6">
            <BrandMark />

            {/* Organization Switcher Dropdown (Authenticated) */}
            {user && (
              <div className="relative hidden sm:block">
                <button
                  type="button"
                  onClick={() => {
                    setOrgMenuOpen(!orgMenuOpen);
                    setProfileMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] hover:border-[var(--border-strong)] text-xs text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  aria-label="Select Organization"
                >
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="font-semibold max-w-[120px] truncate">
                    {activeOrg ? activeOrg.organization.name : 'No Organization'}
                  </span>
                  {activeOrg && (
                    <span className="px-1 py-0.2 rounded text-[10px] font-mono bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50">
                      {activeOrg.membership.role}
                    </span>
                  )}
                  <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
                </button>

                {orgMenuOpen && (
                  <div className="absolute left-0 mt-2 w-64 bg-[var(--surface)] border border-[var(--border-strong)] rounded-lg shadow-lg p-2 z-50 text-left animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                      Switch Organization
                    </div>
                    <div className="space-y-1 my-1">
                      {organizations.map((orgItem) => {
                        const isSelected = activeOrg?.organization.id === orgItem.organization.id;
                        return (
                          <button
                            key={orgItem.organization.id}
                            type="button"
                            onClick={() => {
                              setActiveOrgId(orgItem.organization.id);
                              setOrgMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                              isSelected
                                ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] font-semibold'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                            }`}
                          >
                            <div className="flex flex-col text-left truncate">
                              <span className="truncate">{orgItem.organization.name}</span>
                              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                {orgItem.organization.slug} · {orgItem.membership.role}
                              </span>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0 ml-2" />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="pt-1.5 mt-1.5 border-t border-[var(--border)]">
                      <Link
                        href="/onboarding"
                        onClick={() => setOrgMenuOpen(false)}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-[var(--accent)] hover:bg-[var(--surface-subtle)] transition-colors font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Create New Organization</span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Desktop Horizontal Navigation */}
            <nav
              aria-label="Primary Navigation"
              className="hidden md:flex items-center gap-1"
            >
              {PRIMARY_NAV_ITEMS.map((item) => {
                const active = isActiveRoute(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      active
                        ? 'text-[var(--text-primary)] bg-[var(--surface-raised)] font-semibold shadow-2xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Search, Status, Connect CTA, Theme, Profile */}
          <div className="hidden sm:flex items-center gap-2.5">
            {/* Search trigger */}
            <button
              type="button"
              onClick={() => setModalType('analyze')}
              className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-md text-xs text-[var(--text-muted)] bg-[var(--surface-raised)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              aria-label="Search"
            >
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span>Search...</span>
              <kbd className="text-[10px] font-mono px-1 py-0.2 rounded bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-muted)]">
                ⌘K
              </kbd>
            </button>

            {/* Environment Status */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono text-[var(--text-muted)] bg-[var(--surface-raised)] border border-[var(--border)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
              <span>Local</span>
            </div>

            {/* Theme Switcher */}
            <ThemeToggle />

            {/* Authenticated Actions vs Guest CTA */}
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => setModalType('connect')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-[var(--text-primary)] text-[var(--background)] hover:opacity-90 active:opacity-80 transition-opacity shadow-xs"
                >
                  <GitFork className="w-3.5 h-3.5" />
                  <span>Connect Repo</span>
                </button>

                {/* Profile & Settings Menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(!profileMenuOpen);
                      setOrgMenuOpen(false);
                    }}
                    className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 flex items-center justify-center text-xs font-semibold text-indigo-700 dark:text-indigo-400 hover:border-indigo-300 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] cursor-pointer"
                    aria-label="User Account Menu"
                    aria-expanded={profileMenuOpen}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </button>

                  {profileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-[var(--surface)] border border-[var(--border-strong)] rounded-lg shadow-lg p-2 z-50 text-left animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="px-2 py-1.5 border-b border-[var(--border)] mb-1">
                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {user.name}
                        </p>
                        <p className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                          {user.email}
                        </p>
                      </div>
                      <Link
                        href="/workspace/settings"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>Workspace & Security Settings</span>
                      </Link>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-left"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-[var(--text-primary)] text-[var(--background)] hover:opacity-90 transition-opacity"
                >
                  <span>Get Started</span>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Navigation Controls */}
          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 space-y-2 animate-in slide-in-from-top-2 duration-150">
            {user && activeOrg && (
              <div className="p-2 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] mb-2">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                  Active Organization
                </div>
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  {activeOrg.organization.name} ({activeOrg.membership.role})
                </div>
              </div>
            )}

            <nav className="space-y-1">
              {PRIMARY_NAV_ITEMS.map((item) => {
                const active = isActiveRoute(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                      active
                        ? 'text-[var(--text-primary)] bg-[var(--surface-raised)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="pt-3 border-t border-[var(--border)] flex flex-col gap-2">
              {user ? (
                <>
                  <Link
                    href="/workspace/settings"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)]"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Workspace Settings</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md text-red-600 bg-red-50 dark:bg-red-950/20"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full flex items-center justify-center text-xs font-medium px-3 py-2 rounded-md border border-[var(--border)] text-[var(--text-primary)]"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full flex items-center justify-center text-xs font-medium px-3 py-2 rounded-md bg-[var(--text-primary)] text-[var(--background)]"
                  >
                    Get Started
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Shared Explanatory Modal */}
      <ExplanatoryModal
        type={modalType}
        isOpen={modalType !== null}
        onClose={() => setModalType(null)}
      />
    </>
  );
}
