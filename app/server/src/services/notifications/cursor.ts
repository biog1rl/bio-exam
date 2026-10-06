import { z } from 'zod'

export type CursorPosition = { ts: string; id: string }

const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/

const CursorSchema = z.tuple([
	z
		.string()
		.regex(TIMESTAMP_PATTERN)
		.refine((value) => Number.isFinite(Date.parse(value))),
	z.string().uuid(),
])

export function encodeCursor(position: CursorPosition): string {
	return Buffer.from(JSON.stringify([position.ts, position.id])).toString('base64url')
}

export function decodeCursor(raw: string): CursorPosition | null {
	try {
		const parsed = CursorSchema.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')))
		if (!parsed.success) return null
		return { ts: parsed.data[0], id: parsed.data[1] }
	} catch {
		return null
	}
}
