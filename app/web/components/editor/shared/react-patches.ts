import React from 'react'

// Webpack + React 17 не компилируются при использовании `React.startTransition` или
// `React["startTransition"]`, даже если это находится за проверкой функциональности
// `"startTransition" in React`. Вынос этого в константу позволяет избежать проблемы :/
const START_TRANSITION = 'startTransition'

export function startTransition(callback: () => void) {
	if (START_TRANSITION in React) {
		React[START_TRANSITION](callback)
	} else {
		callback()
	}
}
