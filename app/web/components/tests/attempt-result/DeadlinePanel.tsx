import { ATTEMPT_GRACE_PERIOD_MINUTES } from '@bio-exam/exam-core'

import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

type Props = {
	state: 'sending' | 'failed'
	onRetry: () => void
}

export function DeadlinePanel({ state, onRetry }: Props) {
	if (state === 'failed') {
		return (
			<section className="rounded-lg border border-rose-200 bg-rose-50 p-4">
				<h2 className="text-lg font-semibold">Время вышло</h2>
				<p role="alert" className="mt-2 text-sm">
					Нет связи с сервером. Ответы, которые успели сохраниться, будут приняты в любом случае. Остальное страница
					отправит сама, если связь появится в течение {ATTEMPT_GRACE_PERIOD_MINUTES} минут, — не закрывайте её. Если
					связь уже есть, нажмите «Отправить ответы».
				</p>
				<Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
					Отправить ответы
				</Button>
			</section>
		)
	}
	return (
		<section role="status" className="rounded-lg border border-border bg-card p-4">
			<h2 className="text-lg font-semibold">Время вышло</h2>
			<p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="size-4 animate-spin" aria-hidden="true" />
				Отправляем ответы…
			</p>
		</section>
	)
}
