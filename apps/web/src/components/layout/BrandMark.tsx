import React from 'react';
import Link from 'next/link';

interface BrandMarkProps {
  className?: string;
  showTagline?: boolean;
}

export function BrandMark({ className = '', showTagline = true }: BrandMarkProps) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-lg py-1 px-1.5 transition-colors ${className}`}
      aria-label="Impactra - Software Change Intelligence"
    >
      {/* Precision Geometric Symbol: Change Node with Concentric Propagation Arcs */}
      <div className="relative flex items-center justify-center w-7 h-7 rounded-md bg-[var(--text-primary)] text-[var(--background)] transition-transform group-hover:scale-105 shrink-0 shadow-xs">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 text-current"
        >
          {/* Core Change Node */}
          <circle cx="7" cy="12" r="2.5" fill="currentColor" />
          {/* First Propagation Arc */}
          <path
            d="M12 6.5C14.5 8 16 10 16 12C16 14 14.5 16 12 17.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Outer Impact Horizon Arc */}
          <path
            d="M16.5 4C20 6.5 22 9.2 22 12C22 14.8 20 17.5 16.5 20"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeOpacity="0.7"
          />
        </svg>
      </div>

      <div className="flex flex-col text-left">
        <span className="text-sm font-semibold tracking-wide text-[var(--text-primary)] leading-tight">
          Impactra
        </span>
        {showTagline && (
          <span className="text-[10px] font-medium tracking-tight text-[var(--text-muted)] -mt-0.5">
            Change Intelligence
          </span>
        )}
      </div>
    </Link>
  );
}
