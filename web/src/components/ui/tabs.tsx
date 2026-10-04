import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root
function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex max-w-full flex-wrap overflow-hidden rounded-xl border bg-card', className)} {...props} />
}
function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 px-3.5 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
        className,
      )}
      {...props}
    />
  )
}
const TabsContent = TabsPrimitive.Content

export { Tabs, TabsList, TabsTrigger, TabsContent }
