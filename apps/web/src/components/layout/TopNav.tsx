'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Search,
  Menu,
  X,
  User,
  Settings,
  GitFork,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { ThemeToggle } from '../shared/ThemeToggle';
import { ExplanatoryModal, ExplanatoryModalType } from '../shared/ExplanatoryModal';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [modalType, setModalType] = useState<ExplanatoryModalType>(null);

  const isActiveRoute = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-15 flex items-center justify-between gap-4">
          {/* Left: Brand & Primary Horizontal Navigation */}
          <div className="flex items-center gap-8">
            <BrandMark />

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
            {/* Search shortcut trigger */}
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

            {/* Subtle Local Environment Status */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono text-[var(--text-muted)] bg-[var(--surface-raised)] border border-[var(--border)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
              <span>Local</span>
            </div>

            {/* Theme Switcher */}
            <ThemeToggle />

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={() => setModalType('connect')}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-[var(--text-primary)] text-[var(--background)] hover:opacity-90 active:opacity-80 transition-opacity shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <GitFork className="w-3.5 h-3.5" />
              <span>Connect Repository</span>
            </button>

            {/* Profile & Workspace Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                className="w-7 h-7 rounded-full bg-[var(--surface-raised)] border border-[var(--border)] flex items-center justify-center text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                aria-label="Workspace & Account Menu"
                aria-expanded={profileMenuOpen}
              >
                <User className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[var(--surface)] border border-[var(--border-strong)] rounded-lg shadow-lg p-2 z-50 text-left animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-2 py-1.5 border-b border-[var(--border)] mb-1">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      Engineering Workspace
                    </p>
                    <p className="text-[10px] font-mono text-[var(--text-muted)]">
                      workspace@impactra.internal
                    </p>
                  </div>
                  <Link
                    href="/workspace/repositories"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
                  >
                    <GitFork className="w-3.5 h-3.5" />
                    <span>Repositories</span>
                  </Link>
                  <Link
                    href="/workspace/settings"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Workspace Settings</span>
                  </Link>
                  <div className="pt-1 mt-1 border-t border-[var(--border)]">
                    <span className="block px-2 py-1 text-[10px] font-mono text-[var(--text-muted)]">
                      Impactra Platform
                    </span>
                  </div>
                </div>
              )}
            </div>
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
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setModalType('connect');
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md bg-[var(--text-primary)] text-[var(--background)]"
              >
                <GitFork className="w-3.5 h-3.5" />
                <span>Connect Repository</span>
              </button>
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
