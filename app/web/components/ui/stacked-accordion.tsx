'use client'

import * as React from 'react'

import { GripVerticalIcon } from 'lucide-react'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { cn } from '@/lib/utils'

const STACKED_ACCORDION_ITEM_CLASSNAME = cn(
	'overflow-hidden rounded-lg border transition-all duration-300',
	'data-[state=open]:mb-unit data-[state=closed]:[&:has(+_[data-state=open])]:mb-unit',
	'data-[state=closed]:[[data-state=closed]+&]:rounded-t-none',
	'data-[state=closed]:[&:has(+_[data-state=closed])]:rounded-b-none'
)
const STACKED_ACCORDION_TRIGGER_CLASSNAME = cn(
	'px-unit py-unit hover:bg-muted/40 cursor-pointer space-x-2 rounded-lg text-lg transition-all duration-300 hover:no-underline',
	'data-[state=closed]:rounded-t-none',
	'data-[state=closed]:rounded-b-none'
)
const STACKED_SORTABLE_HANDLE_CLASSNAME =
	'order-1 inline-flex size-7 cursor-grab items-center justify-center rounded-sm text-muted-foreground hover:bg-muted active:cursor-grabbing'

const STACKED_ACCORDION_CONTENT_CLASSNAME = 'px-2'

const StackedAccordion = Accordion

const StackedAccordionItem = React.forwardRef<
	React.ElementRef<typeof AccordionItem>,
	React.ComponentPropsWithoutRef<typeof AccordionItem>
>(({ className, ...props }, ref) => (
	<AccordionItem ref={ref} className={cn(STACKED_ACCORDION_ITEM_CLASSNAME, className)} {...props} />
))
StackedAccordionItem.displayName = 'StackedAccordionItem'

type StackedAccordionTriggerProps = React.ComponentPropsWithoutRef<typeof AccordionTrigger> & {
	sortable?: boolean
	sortableHandleProps?: React.HTMLAttributes<HTMLSpanElement>
	sortableHandleClassName?: string
	sortableHandleIcon?: React.ReactNode
}

const StackedAccordionTrigger = React.forwardRef<
	React.ElementRef<typeof AccordionTrigger>,
	StackedAccordionTriggerProps
>(
	(
		{
			className,
			children,
			sortable = false,
			isSortable = false,
			sortableHandleProps,
			sortableHandleClassName,
			sortableHandleIcon,
			...props
		},
		ref
	) => {
		const sortableEnabled = sortable || isSortable
		const { className: handleClassName, onClick: onHandleClick, ...restHandleProps } = sortableHandleProps ?? {}

		return (
			<AccordionTrigger
				ref={ref}
				isSortable={sortableEnabled}
				className={cn(STACKED_ACCORDION_TRIGGER_CLASSNAME, className)}
				{...props}
			>
				{sortableEnabled ? (
					<span
						{...restHandleProps}
						className={cn(STACKED_SORTABLE_HANDLE_CLASSNAME, handleClassName, sortableHandleClassName)}
						onClick={(event) => {
							event.stopPropagation()
							onHandleClick?.(event)
						}}
					>
						{sortableHandleIcon ?? <GripVerticalIcon className="size-4" />}
					</span>
				) : null}
				{children}
			</AccordionTrigger>
		)
	}
)
StackedAccordionTrigger.displayName = 'StackedAccordionTrigger'

const StackedAccordionContent = React.forwardRef<
	React.ElementRef<typeof AccordionContent>,
	React.ComponentPropsWithoutRef<typeof AccordionContent>
>(({ className, ...props }, ref) => (
	<AccordionContent ref={ref} className={cn(STACKED_ACCORDION_CONTENT_CLASSNAME, className)} {...props} />
))
StackedAccordionContent.displayName = 'StackedAccordionContent'

export { StackedAccordion, StackedAccordionItem, StackedAccordionTrigger, StackedAccordionContent }
