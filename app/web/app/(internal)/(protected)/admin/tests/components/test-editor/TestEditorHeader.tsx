import { Download, Loader2, Save } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface TestEditorHeaderProps {
	title: string
	questionCount: number
	isEditingExisting: boolean
	isPublished: boolean
	timeLimitMinutes: number | null
	saving: boolean
	onSave: () => void
	onExport: (withAnswers: boolean) => void
}

export function TestEditorHeader({
	title,
	questionCount,
	isEditingExisting,
	isPublished,
	timeLimitMinutes,
	saving,
	onSave,
	onExport,
}: TestEditorHeaderProps) {
	return (
		<section className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit border shadow-sm">
			<div className="tab:flex-row tab:items-end tab:justify-between flex flex-col gap-5">
				<div>
					<p className="text-muted-foreground font-mono text-[0.6875rem] uppercase tracking-[0.22em]">
						{isEditingExisting ? 'редактор теста' : 'создание теста'}
					</p>
					<h1 className="text-foreground tab-sm:text-5xl mt-2 max-w-3xl font-serif text-4xl leading-none">
						{title || (isEditingExisting ? 'Редактирование теста' : 'Новый тест')}
					</h1>
					<p className="text-muted-foreground mt-3 text-sm">
						{questionCount} вопросов · {isPublished ? 'опубликован' : 'черновик'}
						{timeLimitMinutes ? ` · ${timeLimitMinutes} мин` : ' · без таймера'}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					{isEditingExisting && (
						<>
							<Button variant="secondary" onClick={() => onExport(false)} className="rounded-full">
								<Download className="mr-2 size-4" />
								Экспорт
							</Button>
							<Button variant="secondary" onClick={() => onExport(true)} className="rounded-full">
								<Download className="mr-2 size-4" />С ответами
							</Button>
						</>
					)}
					<Button onClick={onSave} disabled={saving} className="rounded-full">
						{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
						Сохранить
					</Button>
				</div>
			</div>
		</section>
	)
}
