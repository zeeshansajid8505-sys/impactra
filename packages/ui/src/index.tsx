import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, disabled, children, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer';

    const variants = {
      primary:
        'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] active:opacity-90 shadow-sm',
      secondary:
        'bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] border border-[var(--border)] shadow-xs',
      outline:
        'bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] border border-[var(--border)]',
      ghost:
        'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]',
      danger:
        'bg-[var(--danger)] text-white hover:opacity-90 active:opacity-80 shadow-sm',
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-9 px-4 text-sm gap-2',
      lg: 'h-10 px-5 text-base gap-2.5',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-0.5 mr-2 h-4 w-4 text-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'info' | 'accent' | 'warning' | 'danger' | 'success';
}

export function Badge({ className, variant = 'neutral', children, ...props }: BadgeProps) {
  const variants = {
    neutral: 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] border-[var(--border)]',
    info: 'bg-[var(--info-subtle)] text-[var(--info)] border-[var(--info-border)]',
    accent: 'bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent-border)]',
    warning: 'bg-[var(--warning-subtle)] text-[var(--warning)] border-[var(--warning-border)]',
    danger: 'bg-[var(--danger-subtle)] text-[var(--danger)] border-[var(--danger-border)]',
    success: 'bg-[var(--success-subtle)] text-[var(--success)] border-[var(--success-border)]',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
}

export function Card({ className, hoverEffect = false, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 transition-all duration-150',
        hoverEffect && 'hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface StatusPillProps {
  status: 'safe' | 'warning' | 'danger' | 'neutral' | 'active';
  label: string;
}

export function StatusPill({ status, label }: StatusPillProps) {
  const dotColor = {
    safe: 'bg-[var(--success)]',
    warning: 'bg-[var(--warning)]',
    danger: 'bg-[var(--danger)]',
    neutral: 'bg-[var(--text-muted)]',
    active: 'bg-[var(--accent)] animate-pulse',
  };

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)]">
      <span className={cn('h-1.5 w-1.5 rounded-full', dotColor[status])} />
      {label}
    </span>
  );
}

