import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-[var(--accent-primary)] text-[var(--text-inverse)] hover:brightness-110 shadow-sm',
        destructive: 'bg-[var(--destructive)] text-white hover:bg-[var(--destructive-hover)] shadow-sm',
        outline: 'border border-[var(--border-soft)] bg-transparent hover:bg-[var(--bg-secondary)] hover:border-[var(--border-strong)]',
        secondary: 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
        ghost: 'hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]',
        link: 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
      },
      size: {
        default: 'h-10 px-5 py-2 rounded-xl',
        sm: 'h-9 rounded-lg px-3.5',
        lg: 'h-11 rounded-xl px-8',
        icon: 'h-10 w-10 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
