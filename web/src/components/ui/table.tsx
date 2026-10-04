import * as React from 'react'
import { cn } from '@/lib/utils'

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="scroll-thin w-full overflow-x-auto">
      <table data-slot="table" className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  )
}
const TableHeader = (p: React.ComponentProps<'thead'>) => <thead {...p} />
const TableBody = ({ className, ...p }: React.ComponentProps<'tbody'>) => (
  <tbody className={cn('[&_tr:last-child_td]:border-b-0', className)} {...p} />
)
function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr className={cn(props.onClick && 'cursor-pointer hover:bg-info-soft', className)} {...props} />
}
function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return <th className={cn('whitespace-nowrap border-b px-2.5 py-2 text-left text-[13px] font-semibold text-muted-foreground', className)} {...props} />
}
function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return <td className={cn('border-b px-2.5 py-2.5 align-middle', className)} {...props} />
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }
