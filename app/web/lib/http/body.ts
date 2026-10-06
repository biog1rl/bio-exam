import { isRecord } from '@/lib/utils/is-record'

import { MalformedBodyError } from './request'

export function requireRecord(body: unknown): Record<string, unknown> {
	if (!isRecord(body)) throw new MalformedBodyError()
	return body
}

export function arrayEnvelope<T>(body: unknown, field: string): T {
	if (!Array.isArray(requireRecord(body)[field])) throw new MalformedBodyError()
	return body as T
}
