'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../../../../../vendor-generated/assistant-ui/lib/utils.js';

export const imageVariants = cva('aui-image-root relative overflow-hidden rounded-lg', {
  variants: {
    variant: {
      outline: 'border-border border',
      ghost: '',
      muted: 'bg-muted/50',
    },
    size: {
      sm: 'max-w-64',
      default: 'max-w-96',
      lg: 'max-w-[512px]',
      full: 'w-full',
    },
  },
  defaultVariants: {
    variant: 'outline',
    size: 'default',
  },
});

export type ImageRootProps = React.ComponentProps<'div'> & VariantProps<typeof imageVariants>;

export function ImageRoot({ className, variant, size, children, ...props }: ImageRootProps) {
  return (
    <div
      data-agent-ui-owned=''
      data-slot='image-root'
      data-variant={variant}
      data-size={size}
      className={cn(imageVariants({ variant, size, className }))}
      {...props}
    >
      {children}
    </div>
  );
}
