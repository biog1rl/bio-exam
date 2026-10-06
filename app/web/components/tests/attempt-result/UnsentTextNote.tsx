import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

import type { UnsentEntry } from '../attempt-lifecycle/wal-reconcile'

type Props = {
	entries: readonly UnsentEntry[]
	certain: boolean
	compact?: boolean
	onGoToQuestion?: (questionId: string) => void
}

export function UnsentTextNote({ entries, certain, compact = false, onGoToQuestion }: Props) {
	return (
		<div className="mt-2 min-w-0 rounded-lg border border-dashed border-border bg-card p-4">
			<p className="text-sm font-medium">
				{certain
					? 'Часть ответа, набранная без связи, не дошла до сервера'
					: 'Часть ответа, набранная без связи, могла не дойти до сервера'}
			</p>
			{compact ? null : (
				<p className="mt-1 text-sm text-muted-foreground">
					Засчитан ответ, который успел сохраниться. Ниже — текст с этого устройства, его нельзя изменить.
				</p>
			)}
			<ul className={cn('mt-2 space-y-2', compact && 'max-h-60 overflow-y-auto')}>
				{entries.map((entry) => (
					<li key={entry.questionId}>
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs font-medium">Вопрос {entry.number}</span>
							{!compact && onGoToQuestion ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-11 rounded-full tab:h-8"
									onClick={() => onGoToQuestion(entry.questionId)}
								>
									К вопросу {entry.number}
								</Button>
							) : null}
						</div>
						<div
							role="group"
							tabIndex={0}
							aria-label={`Текст вопроса ${entry.number} с этого устройства`}
							className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-muted px-3 py-2 text-sm leading-6 break-words whitespace-pre-wrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						>
							{entry.text}
						</div>
					</li>
				))}
			</ul>
		</div>
	)
}
