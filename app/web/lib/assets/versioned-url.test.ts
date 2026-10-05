import { describe, expect, it } from 'vitest'

import { versionedUrl } from './versioned-url'

describe('versionedUrl', () => {
	it('адрес прокси с параметром path получает версию отдельным параметром, path не меняется', () => {
		const proxy = `/api/docs/assets/proxy?path=${encodeURIComponent('avatars/u1/abc_cropped.png')}`
		const result = versionedUrl(proxy, 1791188233697)
		expect(result).toBe(`${proxy}&v=1791188233697`)
		expect(new URL(result, 'https://bio-exam.ru').searchParams.get('path')).toBe('avatars/u1/abc_cropped.png')
	})

	it('адрес без параметров получает ?v=', () => {
		expect(versionedUrl('https://x.supabase.co/storage/v1/object/public/main/a.png', 5)).toBe(
			'https://x.supabase.co/storage/v1/object/public/main/a.png?v=5'
		)
	})

	it('фрагмент остаётся в конце', () => {
		expect(versionedUrl('/a.png?x=1#top', 7)).toBe('/a.png?x=1&v=7#top')
	})

	it('локальные blob: и data: адреса не меняются', () => {
		expect(versionedUrl('blob:https://bio-exam.ru/5f0c', 1)).toBe('blob:https://bio-exam.ru/5f0c')
		expect(versionedUrl('data:image/png;base64,AAAA', 1)).toBe('data:image/png;base64,AAAA')
	})
})
