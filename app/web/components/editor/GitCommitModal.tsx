'use client'

import { useState } from 'react'

import { GitCommitHorizontalIcon, Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CommitResult } from '@/types/git'

type GitCommitModalProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	documentPath: string
	documentTitle: string
	onSuccess?: (result: CommitResult) => void
}

export function GitCommitModal({ open, onOpenChange, documentPath, documentTitle, onSuccess }: GitCommitModalProps) {
	const [commitMessage, setCommitMessage] = useState(`Update: ${documentTitle}`)
	const [isCommitting, setIsCommitting] = useState(false)

	const handleCommit = async () => {
		if (!commitMessage.trim()) {
			toast.error('Введите сообщение коммита')
			return
		}

		setIsCommitting(true)
		try {
			const response = await fetch('/api/docs/files/commit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					path: documentPath,
					commitMessage: commitMessage.trim(),
				}),
			})

			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Ошибка при коммите')
			}

			const result: CommitResult = await response.json()

			if (result.success) {
				toast.success(result.committed ? 'Изменения отправлены в Git' : 'Нет изменений для коммита')
				onSuccess?.(result)
				onOpenChange(false)

				// Сохраняем в localStorage для истории
				saveToHistory(commitMessage.trim())
			} else {
				throw new Error('Не удалось выполнить коммит')
			}
		} catch (error) {
			console.error('Commit error:', error)
			toast.error(error instanceof Error ? error.message : 'Ошибка при отправке в Git')
		} finally {
			setIsCommitting(false)
		}
	}

	const handleSkip = () => {
		toast.info('Документ сохранён локально')
		onOpenChange(false)
	}

	const saveToHistory = (message: string) => {
		try {
			const history = JSON.parse(localStorage.getItem('git-commit-history') || '[]') as string[]
			const updated = [message, ...history.filter((m) => m !== message)].slice(0, 5)
			localStorage.setItem('git-commit-history', JSON.stringify(updated))
		} catch (error) {
			console.error('Failed to save commit history:', error)
		}
	}

	const getHistory = (): string[] => {
		try {
			return JSON.parse(localStorage.getItem('git-commit-history') || '[]')
		} catch {
			return []
		}
	}

	const history = getHistory()

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="tab-sm:max-w-125">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<GitCommitHorizontalIcon className="size-5" />
						Отправить изменения в Git
					</DialogTitle>
					<DialogDescription>
						Документ успешно сохранён. Введите сообщение коммита для отправки изменений в Git репозиторий.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-4">
					<div className="grid gap-2">
						<Label htmlFor="commit-message">Сообщение коммита</Label>
						<Input
							id="commit-message"
							value={commitMessage}
							onChange={(e) => setCommitMessage(e.target.value)}
							placeholder="Update: название документа"
							disabled={isCommitting}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault()
									handleCommit()
								}
							}}
						/>
					</div>

					{history.length > 0 && (
						<div className="grid gap-2">
							<Label className="text-muted-foreground text-xs">Недавние сообщения:</Label>
							<div className="flex flex-wrap gap-2">
								{history.map((msg, idx) => (
									<Button
										key={idx}
										variant="outline"
										size="sm"
										className="h-7 text-xs"
										onClick={() => setCommitMessage(msg)}
										disabled={isCommitting}
									>
										{msg.length > 40 ? `${msg.slice(0, 40)}...` : msg}
									</Button>
								))}
							</div>
						</div>
					)}

					<div className="text-muted-foreground flex items-start gap-2 rounded-md border p-3 text-xs">
						<div className="mt-0.5">💡</div>
						<div>
							<strong>Шаблоны:</strong>
							<div className="mt-1 flex flex-wrap gap-1">
								<code
									className="bg-muted cursor-pointer rounded px-1 py-0.5"
									onClick={() => setCommitMessage(`Update: ${documentTitle}`)}
								>
									Update: название
								</code>
								<code
									className="bg-muted cursor-pointer rounded px-1 py-0.5"
									onClick={() => setCommitMessage(`Fix: ${documentTitle}`)}
								>
									Fix: название
								</code>
								<code
									className="bg-muted cursor-pointer rounded px-1 py-0.5"
									onClick={() => setCommitMessage(`Add: ${documentTitle}`)}
								>
									Add: название
								</code>
							</div>
						</div>
					</div>
				</div>

				<DialogFooter className="gap-2 sm:gap-0">
					<Button variant="outline" onClick={handleSkip} disabled={isCommitting}>
						Пропустить
					</Button>
					<Button onClick={handleCommit} disabled={isCommitting || !commitMessage.trim()}>
						{isCommitting ? (
							<>
								<Loader2Icon className="mr-2 size-4 animate-spin" />
								Отправка...
							</>
						) : (
							<>
								<GitCommitHorizontalIcon className="mr-2 size-4" />
								Commit & Push
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
