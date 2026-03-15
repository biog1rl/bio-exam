'use client'

import { useRef } from 'react'

import { Plus, Trash2, ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import type { MatchingPairs } from '../types'
import { generateId } from '../types'

interface Props {
	pairs: MatchingPairs
	correct: Record<string, string>
	onChange: (pairs: MatchingPairs, correct: Record<string, string>) => void
}

export default function MatchingEditor({ pairs, correct, onChange }: Props) {
	const leftRefs = useRef<(HTMLInputElement | null)[]>([])
	const rightRefs = useRef<(HTMLInputElement | null)[]>([])

	const handleAddPair = () => {
		const newLeft = { id: generateId(), text: '' }
		const newRight = { id: generateId(), text: '' }
		onChange(
			{
				left: [...pairs.left, newLeft],
				right: [...pairs.right, newRight],
			},
			correct
		)
	}

	const handleRemoveLeft = (id: string) => {
		if (pairs.left.length <= 2) return
		const newLeft = pairs.left.filter((p) => p.id !== id)
		const newCorrect = { ...correct }
		delete newCorrect[id]
		onChange({ ...pairs, left: newLeft }, newCorrect)
	}

	const handleRemoveRight = (id: string) => {
		if (pairs.right.length <= 2) return
		const newRight = pairs.right.filter((p) => p.id !== id)
		// Remove any mappings that point to this right option
		const newCorrect = Object.fromEntries(Object.entries(correct).filter(([, rightId]) => rightId !== id))
		onChange({ ...pairs, right: newRight }, newCorrect)
	}

	const handleLeftTextChange = (id: string, text: string) => {
		const newLeft = pairs.left.map((p) => (p.id === id ? { ...p, text } : p))
		onChange({ ...pairs, left: newLeft }, correct)
	}

	const handleRightTextChange = (id: string, text: string) => {
		const newRight = pairs.right.map((p) => (p.id === id ? { ...p, text } : p))
		onChange({ ...pairs, right: newRight }, correct)
	}

	const handleMapping = (leftId: string, rightId: string | null) => {
		const newCorrect = { ...correct }
		if (rightId) {
			newCorrect[leftId] = rightId
		} else {
			delete newCorrect[leftId]
		}
		onChange(pairs, newCorrect)
	}

	const handleLeftKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
		if (e.key !== 'Enter') return
		e.preventDefault()
		if (index < pairs.left.length - 1) {
			leftRefs.current[index + 1]?.focus()
		} else {
			const newIndex = pairs.left.length
			handleAddPair()
			queueMicrotask(() => {
				leftRefs.current[newIndex]?.focus()
			})
		}
	}

	const handleRightKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
		if (e.key !== 'Enter') return
		e.preventDefault()
		if (index < pairs.right.length - 1) {
			rightRefs.current[index + 1]?.focus()
		} else {
			const newIndex = pairs.right.length
			handleAddPair()
			queueMicrotask(() => {
				rightRefs.current[newIndex]?.focus()
			})
		}
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<Label>Элементы для сопоставления</Label>
				<Button type="button" variant="outline" size="sm" onClick={handleAddPair}>
					<Plus className="mr-2 h-4 w-4" />
					Добавить пару
				</Button>
			</div>

			<div className="grid gap-6 lg:grid-cols-2">
				{/* Left column */}
				<div className="space-y-2">
					<Label className="text-muted-foreground text-xs">Левая часть</Label>
					{pairs.left.map((item, index) => (
						<div key={item.id} className="flex items-center gap-2">
							<span className="text-muted-foreground w-6 text-sm">{index + 1}.</span>
							<Input
								ref={(el) => {
									leftRefs.current[index] = el
								}}
								value={item.text}
								onChange={(e) => handleLeftTextChange(item.id, e.target.value)}
								onKeyDown={(e) => handleLeftKeyDown(e, index)}
								placeholder={`Элемент ${index + 1}`}
								className="flex-1"
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={() => handleRemoveLeft(item.id)}
								disabled={pairs.left.length <= 2}
							>
								<Trash2 className="text-destructive h-4 w-4" />
							</Button>
						</div>
					))}
				</div>

				{/* Right column */}
				<div className="space-y-2">
					<Label className="text-muted-foreground text-xs">Правая часть</Label>
					{pairs.right.map((item, index) => (
						<div key={item.id} className="flex items-center gap-2">
							<span className="text-muted-foreground w-6 text-sm">{String.fromCharCode(65 + index)}.</span>
							<Input
								ref={(el) => {
									rightRefs.current[index] = el
								}}
								value={item.text}
								onChange={(e) => handleRightTextChange(item.id, e.target.value)}
								onKeyDown={(e) => handleRightKeyDown(e, index)}
								placeholder={`Соответствие ${String.fromCharCode(65 + index)}`}
								className="flex-1"
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={() => handleRemoveRight(item.id)}
								disabled={pairs.right.length <= 2}
							>
								<Trash2 className="text-destructive h-4 w-4" />
							</Button>
						</div>
					))}
				</div>
			</div>

			{/* Mappings */}
			<div className="space-y-2">
				<Label>Правильные соответствия</Label>
				<div className="bg-muted/50 space-y-2 rounded-lg p-4">
					{pairs.left.map((leftItem, index) => (
						<div key={leftItem.id} className="flex items-center gap-2">
							<span className="text-muted-foreground min-w-[100px] truncate text-sm">
								{index + 1}. {leftItem.text || 'Элемент'}
							</span>
							<ArrowRight className="text-muted-foreground h-4 w-4" />
							<Select value={correct[leftItem.id] || ''} onValueChange={(v) => handleMapping(leftItem.id, v || null)}>
								<SelectTrigger className="w-[200px]">
									<SelectValue placeholder="Выберите..." />
								</SelectTrigger>
								<SelectContent>
									{pairs.right.map((rightItem, rightIndex) => (
										<SelectItem key={rightItem.id} value={rightItem.id}>
											{String.fromCharCode(65 + rightIndex)}. {rightItem.text || 'Соответствие'}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					))}
				</div>
				<p className="text-muted-foreground text-xs">
					Укажите, какой элемент слева соответствует какому элементу справа
				</p>
			</div>
		</div>
	)
}
