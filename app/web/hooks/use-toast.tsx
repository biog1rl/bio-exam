import * as React from 'react'

// Определение типа ToastActionElement
export type ToastActionElement = React.ReactElement

// Определение типов тостов для визуального различия
export type ToastType = 'default' | 'destructive' | 'success' | 'warning' | 'info'

// Основной интерфейс Toast
export interface ToastItem {
	id: string
	title?: React.ReactNode
	description?: React.ReactNode
	action?: ToastActionElement
	type?: ToastType
	duration?: number
	variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info'
	onOpenChange?: (open: boolean) => void
	open?: boolean
}

export type ToasterToast = ToastItem

// Типы действий для редюсера
const actionTypes = {
	ADD_TOAST: 'ADD_TOAST',
	UPDATE_TOAST: 'UPDATE_TOAST',
	DISMISS_TOAST: 'DISMISS_TOAST',
	REMOVE_TOAST: 'REMOVE_TOAST',
} as const

// Константы конфигурации
const TOAST_LIMIT = 20
const TOAST_REMOVE_DELAY = 1000

// Генерация ID для тостов
let count = 0

function genId() {
	count = (count + 1) % Number.MAX_VALUE
	return count.toString()
}

// Типы действий для редюсера
type ActionType = typeof actionTypes

type Action =
	| {
			type: ActionType['ADD_TOAST']
			toast: ToasterToast
	  }
	| {
			type: ActionType['UPDATE_TOAST']
			toast: Partial<ToasterToast>
	  }
	| {
			type: ActionType['DISMISS_TOAST']
			toastId?: string
	  }
	| {
			type: ActionType['REMOVE_TOAST']
			toastId?: string
	  }

// Интерфейс состояния
interface State {
	toasts: ToasterToast[]
}

// Отслеживание таймаутов тостов
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

// Редюсер для управления состоянием тостов
const reducer = (state: State, action: Action): State => {
	switch (action.type) {
		case actionTypes.ADD_TOAST:
			return {
				...state,
				toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
			}

		case actionTypes.UPDATE_TOAST:
			return {
				...state,
				toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)),
			}

		case actionTypes.DISMISS_TOAST: {
			const { toastId } = action

			if (toastId === undefined) {
				return {
					...state,
					toasts: state.toasts.map((t) => ({
						...t,
						open: false,
					})),
				}
			}

			return {
				...state,
				toasts: state.toasts.map((t) => (t.id === toastId ? { ...t, open: false } : t)),
			}
		}

		case actionTypes.REMOVE_TOAST: {
			const { toastId } = action

			if (toastId === undefined) {
				return {
					...state,
					toasts: [],
				}
			}

			return {
				...state,
				toasts: state.toasts.filter((t) => t.id !== toastId),
			}
		}
	}
}

// Состояние в памяти и слушатели
const listeners: Array<(state: State) => void> = []
let memoryState: State = { toasts: [] }

// Функция dispatch для обновления состояния и уведомления слушателей
function dispatch(action: Action) {
	memoryState = reducer(memoryState, action)
	listeners.forEach((listener) => {
		listener(memoryState)
	})
}

// Функция toast для создания тостов
type ToastOptions = Omit<ToastItem, 'id'>

function toast(props: ToastOptions) {
	const id = genId()

	// Автоматическое закрытие после истечения времени
	if (props.duration !== Infinity) {
		const timeout = setTimeout(() => {
			dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id })

			// Удаление после завершения анимации
			setTimeout(() => {
				dispatch({ type: actionTypes.REMOVE_TOAST, toastId: id })
			}, TOAST_REMOVE_DELAY)

			toastTimeouts.delete(id)
		}, props.duration || 5000)

		toastTimeouts.set(id, timeout)
	}

	// Методы для тоста
	const update = (props: ToastOptions) => {
		dispatch({
			type: actionTypes.UPDATE_TOAST,
			toast: { ...props, id },
		})
		return id
	}

	const dismiss = () => {
		dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id })

		// Очистка существующего таймаута
		const timeout = toastTimeouts.get(id)
		if (timeout) {
			clearTimeout(timeout)
			toastTimeouts.delete(id)
		}

		// Удаление после завершения анимации
		setTimeout(() => {
			dispatch({ type: actionTypes.REMOVE_TOAST, toastId: id })
		}, TOAST_REMOVE_DELAY)
	}

	// Добавление тоста в состояние
	dispatch({
		type: actionTypes.ADD_TOAST,
		toast: {
			...props,
			id,
			open: true,
			onOpenChange: (open) => {
				if (!open) dismiss()
				props.onOpenChange?.(open)
			},
		},
	})

	return {
		id,
		dismiss,
		update,
	}
}

// Вспомогательные функции для различных типов тостов
toast.default = (props: Omit<ToastOptions, 'type'>) => toast({ ...props, type: 'default' })
toast.destructive = (props: Omit<ToastOptions, 'type'>) => toast({ ...props, type: 'destructive' })
toast.success = (props: Omit<ToastOptions, 'type'>) => toast({ ...props, type: 'success', variant: 'success' })
toast.warning = (props: Omit<ToastOptions, 'type'>) => toast({ ...props, type: 'warning' })
toast.info = (props: Omit<ToastOptions, 'type'>) => toast({ ...props, type: 'info' })

// Хук для использования тостов
function useToast() {
	const [state, setState] = React.useState<State>(memoryState)

	React.useEffect(() => {
		listeners.push(setState)
		return () => {
			const index = listeners.indexOf(setState)
			if (index > -1) {
				listeners.splice(index, 1)
			}
		}
	}, [])

	return {
		...state,
		toast,
		dismiss: (toastId?: string) => {
			dispatch({ type: actionTypes.DISMISS_TOAST, toastId })

			if (toastId) {
				const timeout = toastTimeouts.get(toastId)
				if (timeout) {
					clearTimeout(timeout)
					toastTimeouts.delete(toastId)
				}

				setTimeout(() => {
					dispatch({ type: actionTypes.REMOVE_TOAST, toastId })
				}, TOAST_REMOVE_DELAY)
			}
		},
	}
}

export { useToast, toast }
