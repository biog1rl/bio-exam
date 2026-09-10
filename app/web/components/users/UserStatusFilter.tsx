'use client'

import { Filter } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { UserStatus } from '@/lib/users/status-filter'

const options = [
	{ value: 'active', label: 'Активные' },
	{ value: 'inactive', label: 'Неактивные' },
	{ value: 'all', label: 'Все' },
] as const

export function UserStatusFilter({
	value,
	onChange,
	label = 'Статус студентов',
}: {
	value: UserStatus
	onChange: (value: UserStatus) => void
	label?: string
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button size="icon" variant="outline" aria-label={label}>
					<Filter />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuRadioGroup value={value} onValueChange={(value) => onChange(value as UserStatus)}>
					{options.map((option) => (
						<DropdownMenuRadioItem
							key={option.value}
							value={option.value}
							className="[&>span:first-child]:border-primary [&>span:first-child]:rounded-full [&>span:first-child]:border"
						>
							{option.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
