import { BadgeCheck } from 'lucide-react'

export function TeacherCheckedMark() {
	return (
		<span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-xs font-medium whitespace-nowrap text-accent-foreground">
			<BadgeCheck className="size-3.5" aria-hidden="true" />
			проверено учителем
		</span>
	)
}
