export const IP_TRUSTED = false

export const FREE_PAIR_FAILURES = 5
export const PAIR_BASE_MS = 30_000
export const PAIR_CAP_MS = 900_000

export const LOGIN_FREE_FAILURES = 20
export const LOGIN_BASE_MS = 30_000
export const LOGIN_CAP_MS = 60_000

export const IP_FREE_FAILURES = 50
export const IP_BASE_MS = 30_000
export const IP_CAP_MS = 300_000

export const FAILURE_RESET_MS = 86_400_000

export type BucketKind = 'pair' | 'login' | 'ip'

export type Bucket = {
	key: string
	kind: BucketKind
	login: string | null
}

function doubling(failures: number, free: number, base: number, cap: number): number {
	if (failures <= free) return 0
	return Math.min(base * 2 ** (failures - free - 1), cap)
}

export function pairBlockMs(failures: number, ipTrusted: boolean = IP_TRUSTED): number {
	return doubling(failures, FREE_PAIR_FAILURES, PAIR_BASE_MS, ipTrusted ? PAIR_CAP_MS : LOGIN_CAP_MS)
}

export function loginBlockMs(failures: number): number {
	return doubling(failures, LOGIN_FREE_FAILURES, LOGIN_BASE_MS, LOGIN_CAP_MS)
}

export function ipBlockMs(failures: number): number {
	return doubling(failures, IP_FREE_FAILURES, IP_BASE_MS, IP_CAP_MS)
}

export function blockMs(kind: BucketKind, failures: number, ipTrusted: boolean = IP_TRUSTED): number {
	if (kind === 'pair') return pairBlockMs(failures, ipTrusted)
	if (kind === 'login') return loginBlockMs(failures)
	return ipBlockMs(failures)
}

export function freeFailures(kind: BucketKind): number {
	if (kind === 'pair') return FREE_PAIR_FAILURES
	if (kind === 'login') return LOGIN_FREE_FAILURES
	return IP_FREE_FAILURES
}

export function pairKey(login: string, ip: string): string {
	return `pair:${JSON.stringify([login, ip])}`
}

export function loginKey(login: string): string {
	return `login:${login}`
}

export function ipKey(ip: string): string {
	return `ip:${ip}`
}

export function bucketKeys(login: string, ip: string, ipTrusted: boolean = IP_TRUSTED): Bucket[] {
	const buckets: Bucket[] = [
		{ key: pairKey(login, ip), kind: 'pair', login },
		{ key: loginKey(login), kind: 'login', login },
	]
	if (ipTrusted) buckets.push({ key: ipKey(ip), kind: 'ip', login: null })
	return buckets.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}
