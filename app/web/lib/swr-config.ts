import { SWRConfiguration } from 'swr'

// Глобальная конфигурация SWR для оптимизации
export const swrConfig: SWRConfiguration = {
	// Отключаем автоматическое обновление при фокусе
	revalidateOnFocus: false,

	// Отключаем обновление при переподключении к интернету
	revalidateOnReconnect: false,

	// Отключаем периодическое обновление
	refreshInterval: 0,

	// Отключаем обновление при монтировании компонента
	revalidateOnMount: true,

	// Время кеширования данных (5 минут)
	dedupingInterval: 5 * 60 * 1000,

	// Время жизни кеша (10 минут)
	focusThrottleInterval: 10 * 60 * 1000,

	// Ошибки не должны блокировать повторные запросы
	errorRetryCount: 3,
	errorRetryInterval: 5000,

	// Не показывать загрузку при повторном запросе
	loadingTimeout: 3000,
}
