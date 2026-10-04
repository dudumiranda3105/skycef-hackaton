import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@/lib/utils'

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root data-slot="label" className={cn('text-[13.5px] font-medium leading-none select-none', className)} {...props} />
}

/** Rótulo + campo empilhados (o padrão dos formulários). */
function Field({
  label, hint, children, className,
}: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('grid gap-1.5 text-[13.5px] font-medium', className)}>
      <span>
        {label} {hint && <span className="text-[12.5px] font-normal text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export { Label, Field }
