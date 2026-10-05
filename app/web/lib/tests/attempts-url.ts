import type { UserStatus } from '@/lib/users/status-filter'

export const ATTEMPTS_PATH = '/admin/attempts'

export type AttemptsUrlFilters = { topic: string | null; student: string | null; status: UserStatus }

type ParamsLike = { get(name: string): string | null }
type RecordParams = Record<string, string | string[] | undefined>

const STATUSES: readonly UserStatus[] = ['active', 'inactive', 'all']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function reader(params: ParamsLike | RecordParams): (name: string) => string | null {
	if (typeof (params as ParamsLike).get === 'function') return (name) => (params as ParamsLike).get(name)
	return (name) => {
		const value = (params as RecordParams)[name]
		return (Array.isArray(value) ? value[0] : value) ?? null
	}
}

function cleanValue(value: string | null): string | null {
	const trimmed = value?.trim() ?? ''
	return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : null
}

export function parseAttemptsUrl(params: ParamsLike | RecordParams): AttemptsUrlFilters {
	const get = reader(params)
	const status = get('status')
	const student = cleanValue(get('student'))
	return {
		topic: cleanValue(get('topic')),
		student: student && UUID.test(student) ? student : null,
		status: STATUSES.includes(status as UserStatus) ? (status as UserStatus) : 'active',
	}
}

export function attemptsUrl(filters: Partial<AttemptsUrlFilters>): string {
	const params = new URLSearchParams()
	if (filters.topic) params.set('topic', filters.topic)
	if (filters.student) params.set('student', filters.student)
	if (filters.status && filters.status !== 'active') params.set('status', filters.status)
	const search = params.toString()
	return search ? `${ATTEMPTS_PATH}?${search}` : ATTEMPTS_PATH
}
