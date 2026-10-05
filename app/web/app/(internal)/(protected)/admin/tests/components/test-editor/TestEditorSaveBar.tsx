import { Loader2, Save } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface TestEditorSaveBarProps {
	visible: boolean
	isNew: boolean
	saving: boolean
	disabled: boolean
	onSave: () => void
	onDiscard?: () => void
}

export function TestEditorSaveBar({ visible, isNew, saving, disabled, onSave, onDiscard }: TestEditorSaveBarProps) {
	if (!visible) return null
	return (
		<div className="sticky bottom-unit-mob z-20 tab:bottom-unit">
			<div
				role="region"
				aria-label="Сохранение изменений"
				className="flex flex-col gap-3 rounded-3xl border border-primary/30 bg-card/95 p-3 shadow-lg backdrop-blur-md mob:flex-row mob:items-center mob:justify-between mob:pl-5"
			>
				<p className="text-sm font-medium text-foreground">
					{isNew ? 'Новый тест ещё не сохранён' : 'Есть несохранённые изменения'}
				</p>
				<div className="flex gap-2">
					{onDiscard ? (
						<Button
							variant="outline"
							className="flex-1 rounded-full mob:flex-none"
							onClick={onDiscard}
							disabled={saving}
						>
							Отменить
						</Button>
					) : null}
					<Button className="flex-1 rounded-full mob:flex-none" onClick={onSave} disabled={saving || disabled}>
						{saving ? (
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						) : (
							<Save className="size-4" aria-hidden="true" />
						)}
						Сохранить
					</Button>
				</div>
			</div>
		</div>
	)
}
