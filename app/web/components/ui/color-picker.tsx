'use client'

import { type ComponentProps, forwardRef, useMemo, useState } from 'react'
import { HexColorPicker } from 'react-colorful'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useForwardedRef } from '@/lib/use-forwarded-ref'
import { cn } from '@/lib/utils'

interface ColorPickerProps {
	value: string
	onChange: (value: string) => void
	onBlur?: () => void
	isPopover?: boolean
}

const ColorPicker = forwardRef<
	HTMLInputElement,
	Omit<ComponentProps<typeof Button>, 'value' | 'onChange' | 'onBlur'> & ColorPickerProps
>(({ disabled, value, onChange, onBlur, name, className, size, isPopover = true, ...props }, forwardedRef) => {
	const ref = useForwardedRef(forwardedRef)
	const [open, setOpen] = useState(false)

	const parsedValue = useMemo(() => value || '#FFFFFF', [value])

	const content = (
		<div className={cn('space-y-2', disabled && 'pointer-events-none opacity-50')}>
			<HexColorPicker color={parsedValue} onChange={onChange} />
			<Input
				disabled={disabled}
				maxLength={7}
				name={name}
				onBlur={onBlur}
				onChange={(e) => onChange(e.currentTarget.value)}
				ref={ref}
				value={parsedValue}
			/>
		</div>
	)

	if (!isPopover) {
		return <div className={cn('w-fit space-y-2', className)}>{content}</div>
	}

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild disabled={disabled}>
				<Button
					{...props}
					className={cn('block', className)}
					onBlur={onBlur}
					onClick={() => setOpen(true)}
					size={size}
					style={{ backgroundColor: parsedValue }}
					variant="outline"
				>
					<div />
				</Button>
			</PopoverTrigger>

			<PopoverContent className="w-full">{content}</PopoverContent>
		</Popover>
	)
})

ColorPicker.displayName = 'ColorPicker'

export { ColorPicker }
