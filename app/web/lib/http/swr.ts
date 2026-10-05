import { requestJson } from './request'

export function swrFetcher<T = unknown>(url: string): Promise<T> {
	return requestJson<T>(url)
}

export function fetcherWith<T>(parse: (body: unknown) => T): (url: string) => Promise<T> {
	return (url: string) => requestJson<T>(url, { parse })
}
