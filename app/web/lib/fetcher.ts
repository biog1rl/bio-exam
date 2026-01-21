// Глобальный fetcher для useSWR с оптимизированными настройками
export const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((r) => r.json())

// Конфигурация SWR для оптимизации
export const swrOptions = {
	revalidateOnFocus: false,
	revalidateOnReconnect: false,
	refreshInterval: 0,
	dedupingInterval: 5 * 60 * 1000, // 5 минут
	errorRetryCount: 3,
	errorRetryInterval: 5000,
}
