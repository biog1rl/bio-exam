import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type LeaveFlushResult, leaveDialogDescription, UNSAVED_CHANGES_TEXT } from '@/lib/drafts/draft-ui'

import { useUnsavedChanges } from './unsavedChanges.store'

function store() {
	return useUnsavedChanges.getState()
}

function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((done) => {
		resolve = done
	})
	return { promise, resolve }
}

beforeEach(() => {
	useUnsavedChanges.setState({ dirtyByPath: {}, flushByPath: {}, leavingByPath: {} })
})

describe('leave without a registered flush', () => {
	it('navigates when the path is not dirty', async () => {
		await expect(store().leave('/p')).resolves.toEqual({ kind: 'navigate' })
	})

	it('asks to confirm when the path is dirty', async () => {
		store().setDirty('/p', true)
		await expect(store().leave('/p')).resolves.toEqual({ kind: 'confirm', description: 'Уйти без сохранения?' })
	})

	it('ignores the flag of another path', async () => {
		store().setDirty('/other', true)
		await expect(store().leave('/p')).resolves.toEqual({ kind: 'navigate' })
	})
})

describe('leave with a registered flush', () => {
	it('navigates after a successful flush', async () => {
		const flush = vi.fn(async (): Promise<LeaveFlushResult> => ({ ok: true }))
		store().registerFlush('/p', flush)
		store().setDirty('/p', true)
		await expect(store().leave('/p')).resolves.toEqual({ kind: 'navigate' })
		expect(flush).toHaveBeenCalledTimes(1)
	})

	it('asks to confirm with the failure text when the flush fails', async () => {
		store().registerFlush('/p', async () => ({ ok: false, reason: 'failed' }))
		const decision = await store().leave('/p')
		expect(decision.kind).toBe('confirm')
		expect(decision).toEqual({ kind: 'confirm', description: leaveDialogDescription({ ok: false, reason: 'failed' }) })
		expect(decision.kind === 'confirm' && decision.description).toMatch(/^Последние правки не дошли до сервера/)
	})

	it('uses separate texts for forbidden and gone', async () => {
		store().registerFlush('/p', async () => ({ ok: false, reason: 'forbidden' }))
		await expect(store().leave('/p')).resolves.toEqual({
			kind: 'confirm',
			description: 'Нет прав на сохранение черновика. Последние правки не попали на сервер.',
		})
		store().registerFlush('/p', async () => ({ ok: false, reason: 'gone' }))
		await expect(store().leave('/p')).resolves.toEqual({
			kind: 'confirm',
			description: 'Черновик удалён. Последние правки не сохранятся.',
		})
	})

	it('treats a rejected flush as a failed one', async () => {
		store().registerFlush('/p', async () => {
			throw new Error('network')
		})
		await expect(store().leave('/p')).resolves.toEqual({
			kind: 'confirm',
			description: leaveDialogDescription({ ok: false, reason: 'failed' }),
		})
		expect(store().leavingByPath['/p']).toBe(false)
	})

	it('shares one flush between calls made while it runs', async () => {
		const pending = deferred<LeaveFlushResult>()
		const flush = vi.fn(() => pending.promise)
		store().registerFlush('/p', flush)

		const first = store().leave('/p')
		const second = store().leave('/p')
		expect(second).toBe(first)
		expect(flush).toHaveBeenCalledTimes(1)
		expect(store().leavingByPath['/p']).toBe(true)

		pending.resolve({ ok: true })
		const [a, b] = await Promise.all([first, second])
		expect(a).toEqual({ kind: 'navigate' })
		expect(b).toBe(a)
		expect(store().leavingByPath['/p']).toBe(false)
	})

	it('starts a new flush after the previous one settled', async () => {
		const flush = vi.fn(async (): Promise<LeaveFlushResult> => ({ ok: true }))
		store().registerFlush('/p', flush)
		await store().leave('/p')
		await store().leave('/p')
		expect(flush).toHaveBeenCalledTimes(2)
	})

	it('does not use the flush of another path', async () => {
		const flush = vi.fn(async (): Promise<LeaveFlushResult> => ({ ok: false, reason: 'failed' }))
		store().registerFlush('/other', flush)
		await expect(store().leave('/p')).resolves.toEqual({ kind: 'navigate' })
		expect(flush).not.toHaveBeenCalled()
		expect(store().leavingByPath['/p']).toBeUndefined()
	})
})

describe('registerFlush and clear', () => {
	it('registerFlush with null removes the flush', async () => {
		const flush = vi.fn(async (): Promise<LeaveFlushResult> => ({ ok: false, reason: 'failed' }))
		store().registerFlush('/p', flush)
		store().registerFlush('/p', null)
		expect(store().flushByPath['/p']).toBeUndefined()
		await expect(store().leave('/p')).resolves.toEqual({ kind: 'navigate' })
		expect(flush).not.toHaveBeenCalled()
	})

	it('clear(path) removes the flush and the flag of that path only', async () => {
		const flush = vi.fn(async (): Promise<LeaveFlushResult> => ({ ok: false, reason: 'failed' }))
		store().registerFlush('/p', flush)
		store().setDirty('/p', true)
		store().setDirty('/other', true)
		store().clear('/p')
		expect(store().isDirty('/p')).toBe(false)
		expect(store().flushByPath['/p']).toBeUndefined()
		expect(store().isDirty('/other')).toBe(true)
		await expect(store().leave('/p')).resolves.toEqual({ kind: 'navigate' })
		expect(flush).not.toHaveBeenCalled()
	})

	it('clear() removes every flag and flush', () => {
		store().registerFlush('/p', async () => ({ ok: true }))
		store().setDirty('/p', true)
		store().setDirty('/other', true)
		store().clear()
		expect(store().dirtyByPath).toEqual({})
		expect(store().flushByPath).toEqual({})
	})

	it('confirm text without a flush is the default description', async () => {
		store().setDirty('/p', true)
		await expect(store().leave('/p')).resolves.toEqual({
			kind: 'confirm',
			description: UNSAVED_CHANGES_TEXT.description,
		})
	})
})
