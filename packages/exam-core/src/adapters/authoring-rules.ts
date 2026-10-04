import { AUTHORING_MESSAGES, maxOptionsMessage, minOptionsMessage } from '../authoring-messages'
import type { QuestionTypeValidation } from '../registry'

const DEFAULT_MIN_OPTIONS = 2

function readItems(value: unknown): unknown[] | null {
	return Array.isArray(value) ? value : null
}

function itemField(item: unknown, field: 'id' | 'text'): unknown {
	if (!item || typeof item !== 'object') return undefined
	return (item as Record<string, unknown>)[field]
}

export function hasEmptyText(items: unknown[]): boolean {
	return items.some((item) => {
		const text = itemField(item, 'text')
		return typeof text !== 'string' || text.trim().length === 0
	})
}

export function uniqueStringIds(items: unknown[]): string[] | null {
	const ids = items.map((item) => itemField(item, 'id'))
	if (ids.some((id) => typeof id !== 'string')) return null
	const stringIds = ids as string[]
	return new Set(stringIds).size === stringIds.length ? stringIds : null
}

export function readMatchingSides(value: unknown): { left: unknown[]; right: unknown[] } | null {
	if (!value || typeof value !== 'object') return null
	const left = readItems((value as Record<string, unknown>).left)
	const right = readItems((value as Record<string, unknown>).right)
	if (!left || !right) return null
	return { left, right }
}

export function validateChoiceOptions(
	rawOptions: unknown,
	validation: QuestionTypeValidation | null | undefined
): { error: string } | { optionIds: string[] } {
	const minOptions = Math.max(DEFAULT_MIN_OPTIONS, validation?.minOptions ?? 0)
	const items = readItems(rawOptions)
	if (!items || items.length < minOptions) return { error: minOptionsMessage(minOptions) }
	if (hasEmptyText(items)) return { error: AUTHORING_MESSAGES.choiceOptionEmpty }
	const optionIds = uniqueStringIds(items)
	if (!optionIds) return { error: AUTHORING_MESSAGES.choiceIdsInvalid }
	if (typeof validation?.maxOptions === 'number' && items.length > validation.maxOptions) {
		return { error: maxOptionsMessage(validation.maxOptions) }
	}
	return { optionIds }
}
