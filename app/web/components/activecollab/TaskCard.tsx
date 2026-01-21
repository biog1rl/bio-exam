'use client'

import { ExternalLink, MessageSquareMoreIcon } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import activecollabConfig from '@/config/activecollab.config'
import type { ActiveCollabTask } from '@/types/activecollab'

interface TaskCardProps {
	task: ActiveCollabTask
}

export function TaskCard({ task }: TaskCardProps) {
	return (
		<Card className="transition-shadow hover:shadow-md">
			<CardContent className="px-4 py-2">
				<div className="flex flex-row items-center justify-between">
					<div className="flex items-center gap-x-2 text-sm leading-none">
						{task.url_path && (
							<Link
								href={`${activecollabConfig.url}/${activecollabConfig.id}${task.url_path}`}
								target="_blank"
								rel="noopener noreferrer"
							>
								<ExternalLink className="-mt-px h-4 w-4" />
							</Link>
						)}
						<div className="flex items-center gap-x-2">{task.task_number && `#${task.task_number} - ${task.name}`}</div>
						<div className="flex items-center gap-x-1">
							<MessageSquareMoreIcon className="text-muted-foreground -mb-px size-4" />
							{task.comments_count > 0 && <span className="text-muted-foreground text-sm">{task.comments_count}</span>}
						</div>
					</div>
					<div className="flex gap-x-2">
						{task.labels?.map((label) => (
							<Badge key={label.id} variant="default">
								{label.name}
							</Badge>
						))}
					</div>
				</div>
			</CardContent>
		</Card>
	)
}
