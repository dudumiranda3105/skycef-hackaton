import * as React from 'react'
import { cn } from '@/lib/utils'

const campo =
  'w-full min-h-9.5 rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:bg-danger-soft'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(campo, className)} {...props} />
}
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(campo, 'min-h-[72px] resize-y', className)} {...props} />
}
/** Select nativo com o visual do shadcn: leve, acessível e funciona bem em celular. */
function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <select data-slot="select" className={cn(campo, 'cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  )
}

export { Input, Textarea, Select, campo }
