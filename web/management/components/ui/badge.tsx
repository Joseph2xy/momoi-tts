import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        speaking: 'border-primary/25 bg-primary/10 text-primary',
        error: 'border-destructive/25 bg-destructive/10 text-destructive',
        quiet: 'border-border bg-secondary text-muted-foreground',
        warning: 'border-warning/35 bg-warning/15 text-warning',
        success: 'border-success/25 bg-success/10 text-success',
      },
    },
    defaultVariants: {
      variant: 'quiet',
    },
  },
);

function Badge({
  className,
  variant = 'quiet',
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge };
