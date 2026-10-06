import { Skeleton } from '@/components/ui/skeleton'

export default function NotificationListSkeleton() {
	return (
		<div>
			<ul className="space-y-1 p-2" aria-busy="true">
				<li>
					<Skeleton className="h-14 rounded-2xl" />
				</li>
				<li>
					<Skeleton className="h-14 rounded-2xl" />
				</li>
				<li>
					<Skeleton className="h-14 rounded-2xl" />
				</li>
			</ul>
			<span className="sr-only" role="status">
				Загрузка уведомлений
			</span>
		</div>
	)
}
