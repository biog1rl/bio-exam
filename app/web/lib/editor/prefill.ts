// frontend/lib/editor/prefill.ts
'use client'

export type EditorPrefillFrontmatter = {
	title?: string
	[key: string]: unknown
}

export type EditorPrefill = {
	body: string
	frontmatter?: EditorPrefillFrontmatter
}

const keyFor = (slug: string) => `its-doc:editor:prefill:${slug}`

export function setEditorPrefill(slug: string, prefill: EditorPrefill): void {
	if (typeof window === 'undefined') return
	try {
		const payload = JSON.stringify(prefill)
		sessionStorage.setItem(keyFor(slug), payload)
	} catch {
		// ignore quota/serialization errors
	}
}

export function popEditorPrefill(slug: string): EditorPrefill | null {
	if (typeof window === 'undefined') return null
	try {
		const raw = sessionStorage.getItem(keyFor(slug))
		if (!raw) return null
		sessionStorage.removeItem(keyFor(slug))

		const parsed: unknown = JSON.parse(raw)
		if (!parsed || typeof parsed !== 'object') return null

		const body = (parsed as { body?: unknown }).body
		const frontmatter = (parsed as { frontmatter?: unknown }).frontmatter

		if (typeof body !== 'string') return null

		const fm: EditorPrefillFrontmatter | undefined =
			frontmatter && typeof frontmatter === 'object' ? (frontmatter as EditorPrefillFrontmatter) : undefined

		return { body, frontmatter: fm }
	} catch {
		return null
	}
}
