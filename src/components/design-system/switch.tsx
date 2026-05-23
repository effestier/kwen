'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
  fullWidth?: boolean;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, description, fullWidth = false, className, id, ...props }, ref) => {
    const switchId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className={cn('flex items-center gap-3', fullWidth && 'justify-between')}>
        {(label || description) && (
          <div className="flex-1">
            {label && (
              <label
                htmlFor={switchId}
                className="text-sm font-medium text-[var(--text-primary)] cursor-pointer"
              >
                {label}
              </label>
            )}
            {description && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>
            )}
          </div>
        )}
        <label
          htmlFor={switchId}
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full',
            'transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2',
            'cursor-pointer',
            props.checked || props.defaultChecked
              ? 'bg-[var(--accent-primary)]'
              : 'bg-[var(--border-soft)]',
            className
          )}
        >
          <span
            className={cn(
              'inline-block h-5 w-5 rounded-full bg-white shadow-sm',
              'transform transition-transform duration-200',
              'flex items-center justify-center',
              props.checked || props.defaultChecked ? 'translate-x-[22px]' : 'translate-x-0.5'
            )}
          >
            {/* Tiny checkmark when on */}
            {(props.checked || props.defaultChecked) && (
              <svg
                className="h-3 w-3 text-[var(--accent-primary)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="3"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </span>
        </label>
        <input
          ref={ref}
          type="checkbox"
          id={switchId}
          className="sr-only"
          {...props}
        />
      </div>
    );
  }
);

Switch.displayName = 'Switch';

// Toggle button group variant
interface ToggleGroupProps {
  options: { value: string; label: string; icon?: React.ReactNode }[];
  value: string;
  onChange: (value: string) => void;
  fullWidth?: boolean;
}

export function ToggleGroup({ options, value, onChange, fullWidth = false }: ToggleGroupProps) {
  return (
    <div
      className={cn(
        'flex rounded-lg border border-[var(--border-subtle)] overflow-hidden',
        fullWidth && 'w-full'
      )}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium',
            'transition-all duration-150',
            value === option.value
              ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)]'
              : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
            index > 0 && 'border-l border-[var(--border-subtle)]'
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}