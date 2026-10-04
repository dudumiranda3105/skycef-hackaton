import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap [&>svg]:size-3',
  {
    variants: {
      tom: {
        neutro: 'bg-secondary text-foreground',
        ok: 'bg-success-soft text-success',
        aviso: 'bg-warning-soft text-warning',
        ruim: 'bg-danger-soft text-destructive',
        info: 'bg-info-soft text-info',
      },
    },
    defaultVariants: { tom: 'neutro' },
  },
)

export interface BadgeProps extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

function Badge({ className, tom, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ tom }), className)} {...props} />
}

export { Badge, badgeVariants }
