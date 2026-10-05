import { Loader2, Save } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'

import { TestSettingsPanel, type TestSettingsPanelProps } from './TestSettingsPanel'

interface TestSettingsSheetProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	isNew: boolean
	dirty: boolean
	saving: boolean
	saveDisabled: boolean
	onSave: () => void
	onDiscard?: () => void
	panel: TestSettingsPanelProps
}

export function TestSettingsSheet({
	open,
	onOpenChange,
	isNew,
	dirty,
	saving,
	saveDisabled,
	onSave,
	onDiscard,
	panel,
}: TestSettingsSheetProps) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="gap-0 tab-sm:max-w-md">
				<SheetHeader className="border-b border-border/70 pr-12">
					<SheetTitle>Настройки теста</SheetTitle>
					<SheetDescription>
						{isNew ? 'Выберите тему и название, затем сохраните тест.' : 'Изменения вступают в силу после сохранения.'}
					</SheetDescription>
				</SheetHeader>
				<div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
					<TestSettingsPanel {...panel} />
				</div>
				<SheetFooter className="flex-row justify-end gap-2 border-t border-border/70">
					{onDiscard ? (
						<Button
							variant="outline"
							className="rounded-full"
							onClick={() => {
								onDiscard()
								onOpenChange(false)
							}}
							disabled={saving || !dirty}
						>
							Отменить
						</Button>
					) : null}
					<Button className="rounded-full" onClick={onSave} disabled={saving || saveDisabled || (!isNew && !dirty)}>
						{saving ? (
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						) : (
							<Save className="size-4" aria-hidden="true" />
						)}
						Сохранить
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	)
}
