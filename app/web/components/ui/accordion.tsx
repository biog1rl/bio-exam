'use client'

import * as AccordionPrimitive from '@radix-ui/react-accordion'

import * as React from 'react'

import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

const Accordion = AccordionPrimitive.Root

const AccordionItem = React.forwardRef<
	React.ElementRef<typeof AccordionPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
	<AccordionPrimitive.Item ref={ref} className={cn('border-b', className)} {...props} />
))
AccordionItem.displayName = 'AccordionItem'

type AccordionTriggerProps = React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & {
	chevronPosition?: 'left' | 'right'
	isSortable?: boolean
}

const AccordionTrigger = React.forwardRef<React.ElementRef<typeof AccordionPrimitive.Trigger>, AccordionTriggerProps>(
	({ className, children, chevronPosition = 'right', isSortable = false, ...props }, ref) => (
		<AccordionPrimitive.Header className="flex">
			<AccordionPrimitive.Trigger
				data-slot="trigger"
				ref={ref}
				className={cn(
					'flex flex-1 cursor-pointer items-center py-4 text-left text-sm font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180',
					className
				)}
				{...props}
			>
				{children}
				<ChevronDown
					className={cn(
						'text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200',
						chevronPosition === 'left' ? (!isSortable ? 'order-first' : 'order-2') : 'order-last ml-auto'
					)}
				/>
			</AccordionPrimitive.Trigger>
		</AccordionPrimitive.Header>
	)
)
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

const AccordionContent = React.forwardRef<
	React.ElementRef<typeof AccordionPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
	<AccordionPrimitive.Content
		ref={ref}
		className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
		{...props}
	>
		<div className={cn('pb-2 pt-0', className)}>{children}</div>
	</AccordionPrimitive.Content>
))
AccordionContent.displayName = AccordionPrimitive.Content.displayName

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
