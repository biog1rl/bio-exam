import { failureOf } from './errors'
import { requestJson } from './request'

export function swrFetcher<T = unknown>(url: string): Promise<T> {
	return requestJson<T>(url)
}

export function fetcherWith<T>(parse: (body: unknown) => T): (url: string) => Promise<T> {
	return (url: string) => requestJson<T>(url, { parse })
}

export function deniedAsNull<T>(fetcher: (url: string) => Promise<T>): (url: string) => Promise<T | null> {
	return async (url) => {
		try {
			return await fetcher(url)
		} catch (error) {
			const failure = failureOf(error)
			if (failure.kind === 'auth') return null
			if (failure.kind === 'http' && (failure.status === 401 || failure.status === 403)) return null
			throw error
		}
	}
}
